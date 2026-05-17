import { corsHeaders, corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, makeAnonClient } from '../_shared/supabase.ts';

// Username rules: 3–20 chars, letters/numbers/underscore only
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function syntheticEmail(username: string): string {
  return `${username.toLowerCase()}@pokemontracker.app`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/(?:functions\/v1\/)?auth\/?/, '')
    .replace(/^\//, '');

  const serviceClient = makeClient();

  try {
    // ── GET /check?username=Foo ──────────────────────────────────────────────
    if (req.method === 'GET' && path === 'check') {
      const username = url.searchParams.get('username') ?? '';
      if (!USERNAME_RE.test(username)) {
        return json({ available: false, reason: 'invalid' });
      }
      const { data } = await serviceClient
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();
      return json({ available: data === null });
    }

    // ── POST /register ───────────────────────────────────────────────────────
    if (req.method === 'POST' && path === 'register') {
      const { username, pin, realEmail, isChild } = await req.json();

      if (!username || !pin || !realEmail) {
        return err('username, pin, and realEmail are required', 400);
      }
      if (!USERNAME_RE.test(username)) {
        return err('Username must be 3–20 characters: letters, numbers, underscore only', 400);
      }
      if (!/^\d{6}$/.test(pin)) {
        return err('PIN must be exactly 6 digits', 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail)) {
        return err('Invalid email address', 400);
      }

      // Check username availability
      const { data: existing } = await serviceClient
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();
      if (existing) return err('Username is already taken', 409);

      const synthetic = syntheticEmail(username);

      // Create Supabase auth user — email_confirm: true skips Supabase's own confirmation email
      // (Supabase "Confirm email" setting is disabled in the dashboard; we handle confirmation via Resend)
      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email: synthetic,
        password: pin,
        email_confirm: true,
      });
      if (authError || !authData.user) {
        return err(authError?.message ?? 'Failed to create account', 500);
      }

      // Insert profile row
      const { error: profileError } = await serviceClient.from('profiles').insert({
        id: authData.user.id,
        username,
        synthetic_email: synthetic,
        real_email: realEmail,
        is_child: isChild === true,
      });
      if (profileError) {
        // Roll back the auth user so we don't leave an orphan
        await serviceClient.auth.admin.deleteUser(authData.user.id);
        return err('Failed to save profile: ' + profileError.message, 500);
      }

      // Send confirmation email via Resend
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        await sendConfirmationEmail(resendKey, realEmail, username, isChild === true);
      }

      return json({ success: true }, 201);
    }

    // ── POST /login ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && path === 'login') {
      const { username, pin } = await req.json();
      if (!username || !pin) return err('username and pin are required', 400);

      // Look up synthetic email using service key (profiles is not publicly readable)
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('synthetic_email')
        .eq('username', username)
        .maybeSingle();

      if (!profile) {
        // Generic error — don't reveal whether username exists
        return err('Invalid username or PIN', 401);
      }

      // Sign in with anon key — this is the only way to get a user session JWT
      const anonClient = makeAnonClient();
      const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: profile.synthetic_email,
        password: pin,
      });

      if (signInError || !sessionData.session) {
        return err('Invalid username or PIN', 401);
      }

      return json({ session: sessionData.session });
    }

    // ── POST /forgot-pin ─────────────────────────────────────────────────────
    if (req.method === 'POST' && path === 'forgot-pin') {
      const { username } = await req.json();
      if (!username) return err('username is required', 400);

      const { data: profile } = await serviceClient
        .from('profiles')
        .select('synthetic_email, real_email, is_child')
        .eq('username', username)
        .maybeSingle();

      // Always return success — don't reveal whether username exists
      if (!profile) return json({ success: true });

      // Generate a Supabase-signed recovery link
      const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: profile.synthetic_email,
        options: {
          redirectTo: 'https://pokemon-tracker-sable.vercel.app/reset-pin',
        },
      });

      if (linkError || !linkData) {
        console.error('generateLink error:', linkError);
        return json({ success: true }); // still don't reveal failure
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        await sendPinResetEmail(
          resendKey,
          profile.real_email,
          username,
          linkData.properties.action_link,
          profile.is_child,
        );
      }

      return json({ success: true });
    }

    return err('Not found', 404);
  } catch (e) {
    console.error('Auth error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});

// ── Email helpers (Resend) ────────────────────────────────────────────────────

async function sendConfirmationEmail(
  apiKey: string,
  to: string,
  username: string,
  isChild: boolean,
): Promise<void> {
  const subject = isChild
    ? `Your child's PokeTracker account is ready`
    : `Welcome to PokeTracker, ${username}!`;

  const html = isChild
    ? `<p>A PokeTracker account has been created for <strong>${username}</strong>.</p>
       <p>They can log in at <a href="https://pokemon-tracker-sable.vercel.app">pokemon-tracker-sable.vercel.app</a> using their username and 6-digit PIN.</p>
       <p>As the parent or guardian, you can request to view, edit, or delete your child's data at any time by emailing us. See our <a href="https://pokemon-tracker-sable.vercel.app/privacy">Privacy Policy</a> for your full rights.</p>`
    : `<p>Welcome, <strong>${username}</strong>! Your PokeTracker account is ready.</p>
       <p>Log in at <a href="https://pokemon-tracker-sable.vercel.app">pokemon-tracker-sable.vercel.app</a> using your username and 6-digit PIN.</p>`;

  await resendSend(apiKey, to, subject, html);
}

async function sendPinResetEmail(
  apiKey: string,
  to: string,
  username: string,
  resetLink: string,
  isChild: boolean,
): Promise<void> {
  const subject = isChild
    ? `PIN reset for ${username}'s PokeTracker account`
    : `Reset your PokeTracker PIN`;

  const intro = isChild
    ? `A PIN reset was requested for your child's PokeTracker account (<strong>${username}</strong>).`
    : `A PIN reset was requested for your PokeTracker account (<strong>${username}</strong>).`;

  const html = `<p>${intro}</p>
    <p><a href="${resetLink}" style="background:#378ADD;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset PIN</a></p>
    <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`;

  await resendSend(apiKey, to, subject, html);
}

async function resendSend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PokeTracker <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error:', text);
  }
}
