{
  "appId": "com.naijaclips.app",
  "appName": "NaijaClips",
  "webDir": ".",
  "server": {
    "androidScheme": "https"
  }
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.NAIJACLIPS_SUPABASE || {};
const $ = (id) => document.getElementById(id);
const ready = typeof config.url === 'string' && config.url.startsWith('https://') &&
  !config.url.includes('YOUR-PROJECT') && typeof config.anonKey === 'string' &&
  config.anonKey.length > 20 && !config.anonKey.includes('YOUR_SUPABASE');
const cloudStatus = $('cloudStatus');
const cloudFeed = $('cloudFeed');
let supabase = null;
let currentUser = null;

function status(message, error = false) {
  cloudStatus.textContent = message;
  cloudStatus.style.color = error ? '#ff9b9b' : 'var(--green)';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function humanSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function publicVideoUrl(path) {
  return supabase.storage.from('clips').getPublicUrl(path).data.publicUrl;
}
function setSignedInUI(user) {
  currentUser = user || null;
  $('cloudAuthForm').classList.toggle('hidden', !!user);
  $('cloudSignOutAlt').classList.toggle('hidden', !user);
  $('cloudUploadForm').classList.toggle('hidden', !user);
  $('cloudUser').textContent = user ? `Signed in: ${user.email || 'account'}` : 'Not signed in';
}
function renderCloudCards(clips) {
  if (!clips.length) {
    cloudFeed.innerHTML = '<div class="empty-state"><div style="font-size:2rem">🌍</div><h3>No public clips yet</h3><p>When someone posts a cloud clip, it can appear here for other visitors too.</p></div>';
    return;
  }
  cloudFeed.innerHTML = '';
  for (const clip of clips) {
    const card = document.createElement('article');
    card.className = 'card';
    const url = publicVideoUrl(clip.storage_path);
    card.innerHTML = `<div class="video-wrap"><video controls playsinline preload="metadata" src="${escapeHtml(url)}" aria-label="${escapeHtml(clip.caption)}"></video></div><div class="card-body"><div class="caption">${escapeHtml(clip.caption)}</div><div class="meta"><span>${new Date(clip.created_at).toLocaleDateString()}</span><span>${humanSize(clip.size_bytes)}</span></div><div class="card-actions"><button data-download>↓ Download</button><button class="secondary" data-share>↗ Share</button>${currentUser && currentUser.id !== clip.user_id ? '<button class="secondary" data-report>⚑ Report</button>' : ''}${currentUser && currentUser.id === clip.user_id ? '<button class="danger" data-delete>Delete</button>' : ''}</div></div>`;
    card.querySelector('[data-download]').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = url; a.download = clip.original_filename || 'naijaclips-video.mp4'; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    });
    card.querySelector('[data-share]').addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({title:'NaijaClips', text:clip.caption, url});
        else { await navigator.clipboard.writeText(url); status('Video link copied.'); }
      } catch (e) { if (e?.name !== 'AbortError') status('Could not share this link.', true); }
    });
    const report = card.querySelector('[data-report]');
    if (report) report.addEventListener('click', async () => {
      if (!currentUser) { status('Sign in before reporting a clip.', true); return; }
      const choices = 'nudity, violence, hate, harassment, spam, copyright, underage_safety, other';
      const reason = prompt(`Why are you reporting this clip? Enter one reason exactly:\n${choices}`, 'spam');
      if (!reason) return;
      const normalized = reason.trim().toLowerCase();
      if (!choices.split(', ').includes(normalized)) { status('Please enter one of the listed report reasons.', true); return; }
      const details = prompt('Optional details (max 1000 characters):', '') || '';
      report.disabled = true;
      const { error } = await supabase.from('content_reports').insert({
        reporter_user_id: currentUser.id, clip_id: clip.id, reported_user_id: clip.user_id,
        reason: normalized, details: details.slice(0, 1000)
      });
      report.disabled = false;
      if (error) { status('Report could not be submitted. Apply backend/community-safety.sql first. ' + error.message, true); return; }
      status('Report submitted. Our moderation process still needs an operator to review it.');
    });
    const del = card.querySelector('[data-delete]');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Delete this public clip? This removes the clip from the shared feed.')) return;
      del.disabled = true;
      const { error: storageError } = await supabase.storage.from('clips').remove([clip.storage_path]);
      if (storageError) { status(storageError.message, true); del.disabled = false; return; }
      const { error } = await supabase.from('clips').delete().eq('id', clip.id).eq('user_id', currentUser.id);
      if (error) { status(error.message, true); return; }
      status('Your clip was deleted.'); await loadCloudFeed();
    });
    cloudFeed.appendChild(card);
  }
}
async function loadCloudFeed() {
  if (!supabase) return;
  cloudFeed.innerHTML = '<div class="empty-state">Loading shared clips…</div>';
  const { data, error } = await supabase.from('clips').select('id,user_id,caption,storage_path,original_filename,content_type,size_bytes,created_at').order('created_at', {ascending:false}).limit(60);
  if (error) { cloudFeed.innerHTML = '<div class="empty-state">Could not load cloud feed. Check the setup guide and Supabase policies.</div>'; status(error.message, true); return; }
  renderCloudCards(data || []);
  $('cloudCount').textContent = String((data || []).length);
}
async function init() {
  if (!ready) {
    status('Cloud mode is not configured yet. Add your Supabase URL and public anon/publishable key in supabase-config.js.', true);
    cloudFeed.innerHTML = '<div class="empty-state"><div style="font-size:2rem">☁️</div><h3>Cloud feed setup needed</h3><p>Follow backend/CLOUD_SETUP.md. Until then, use the local-device feed below.</p></div>';
    $('cloudAuthForm').classList.remove('hidden'); $('cloudUploadForm').classList.add('hidden'); $('cloudAuthForm').querySelectorAll('input,button').forEach(el => el.disabled = true);
    return;
  }
  supabase = createClient(config.url, config.anonKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const { data: { session } } = await supabase.auth.getSession();
  setSignedInUI(session?.user);
  supabase.auth.onAuthStateChange((_event, sessionNow) => { setSignedInUI(sessionNow?.user); loadCloudFeed(); });
  await loadCloudFeed();
}
$('cloudAuthForm').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!supabase) return;
  const email = $('cloudEmail').value.trim(); const password = $('cloudPassword').value;
  const action = event.submitter?.dataset.authAction || 'signin';
  status(action === 'signup' ? 'Creating account…' : 'Signing in…');
  const result = action === 'signup'
    ? await supabase.auth.signUp({email, password})
    : await supabase.auth.signInWithPassword({email, password});
  if (result.error) { status(result.error.message, true); return; }
  if (action === 'signup' && !result.data.session) status('Account created. Check your email to confirm it, then sign in.');
  else { setSignedInUI(result.data.user); status('You are signed in.'); await loadCloudFeed(); }
});
$('cloudSignOutAlt').addEventListener('click', async () => { if (!supabase) return; const {error} = await supabase.auth.signOut(); if (error) status(error.message, true); else {setSignedInUI(null); status('Signed out.'); await loadCloudFeed();} });
$('cloudUploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) { status('Sign in before posting.', true); return; }
  const file = $('cloudVideoFile').files[0]; const caption = $('cloudCaption').value.trim();
  if (!file || !caption) return;
  if (!file.type.startsWith('video/')) { status('Please choose a video file.', true); return; }
  if (file.size > 250 * 1024 * 1024) { status('The current upload limit is 250 MB.', true); return; }
  const btn = $('cloudPublishBtn'); btn.disabled = true; status('Uploading video to cloud storage…');
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('clips').upload(path, file, {contentType:file.type, upsert:false});
  if (uploadError) { status(uploadError.message, true); btn.disabled = false; return; }
  const { error: insertError } = await supabase.from('clips').insert({user_id:currentUser.id,caption,storage_path:path,original_filename:file.name,content_type:file.type,size_bytes:file.size});
  if (insertError) {
    await supabase.storage.from('clips').remove([path]);
    status(insertError.message, true); btn.disabled = false; return;
  }
  $('cloudUploadForm').reset(); status('Published to the shared cloud feed.'); await loadCloudFeed(); btn.disabled = false;
});
init().catch(error => { console.error(error); status('Cloud setup error: ' + (error.message || 'unknown error'), true); });
▶ NaijaClips
Creator earnings
Track confirmed earnings and request payouts. Earnings are not generated by demo views. Payouts remain pending until the operator configures and verifies a payment provider.
Account
Checking cloud configuration…
Email

Password

Sign in Create account
Sign out

Available balance
₦0.00
Minimum payout request: ₦5,000.00. A request is not a promise of payment; bank/provider verification and manual approval are required.
Sign in to view your ledger.
Bank payout details
Use your own bank account. These details are stored in your authenticated account's private row. Do not enter another person's details without permission.
Account name

Bank name

Bank code

10-digit account number

Save bank details
Request a payout
Amount in naira (₦)

Request payout
This creates a tracked request. No money is transferred by this prototype.
No requests loaded.
Advertising setup
Ad placements reserved — no live ads are served yet.
Live ads require an approved publisher account, correct web/native SDK integration, app IDs, consent/privacy disclosures, invalid-traffic controls, and provider-side reporting. Revenue must be imported from verified provider reports on the server, not inferred from clicks or views in this page.
Back to videos
NaijaClips launch checklist

BEFORE DEPLOYING
[ ] Extract the complete ZIP.
[ ] If enabling cloud mode, create a Supabase project.
[ ] Run backend/supabase-schema.sql in the Supabase SQL Editor.
[ ] Replace placeholders in supabase-config.js with Project URL + public anon/publishable key only.
[ ] Set Supabase Auth Site URL and redirect URLs to the exact Netlify HTTPS URL.
[ ] Set an upload/storage budget alert and test with small videos first.

AFTER DEPLOYING
[ ] Open the Netlify URL on a phone.
[ ] Test local-device upload and playback.
[ ] Test cloud account signup/sign-in.
[ ] Test cloud upload and playback from a second browser/device.
[ ] Test deleting your own clip and confirm another account cannot delete it.
[ ] Test sign-out and account confirmation/recovery.
[ ] Add moderation/reporting, privacy policy, terms, monitoring and backups before public promotion.

NOT YET INCLUDED
- Native App Store / Google Play submission
- Video transcoding/adaptive streaming/CDN
- Ad network or sponsor integrations
- Creator earnings, payout accounts, tax and fraud controls
- Production security review and moderation operations
← Back to NaijaClips
DEPLOYMENT TOOL · v7
NaijaClips setup check
Run this after uploading the project to Netlify. It checks browser configuration and basic Supabase connectivity; it does not prove production security, payment readiness, or store approval.
Run checks
Cloud setup guide
Results
Press “Run checks” to start.
Important safety notes
	•	Only the Supabase public anon/publishable key belongs in supabase-config.js.
	•	Never put a service-role key, database password, or Paystack secret in this website.
	•	A successful connection does not mean ads or creator payouts are active.
	•	Test sign-up, email confirmation, upload, playback, download, owner deletion, and a second account on separate devices before launch.
▶
NaijaClips
＋ Post a clip
YOUR VIDEO COMMUNITY
Watch it. Make it. Share the vibe.
Discover short videos, save your favourites, download clips and share your own moments. Made for creators everywhere.
0
clips on this device
Two modes: the local feed stores clips on this device. The cloud feed below can be shared with other people after you connect your own Supabase backend using the included setup guide.
🌍 Public cloud feed (0 loaded)
Clips posted here can be viewed by other visitors. Create an account to publish. Only upload videos you have the right to share.
Checking cloud setup…
Email address

Password (8+ characters)

Sign in
Create account

Preparing cloud feed…
Local device feed: the original offline prototype remains available below. Local clips are not public and will not transfer to another device.
For you
Liked
Saved
For you
Your clips, ready to watch and share.
Newest first ↕
🎬
Your feed starts here
Post a video from your phone to get started. Your clip will appear here and you can play, download or share it.
＋ Upload first clip
＋ Post a video
Choose a video from your phone, add a caption, then publish it to this device's feed.
Video file *

MP4 works best. Large videos use storage on your device; keep a backup of the original.
Caption *
Up to 180 characters.
Publish clip

💸 Creator earnings & payouts
Creators can review verified ledger entries and submit payout requests once the cloud backend is configured. Live ads and automatic transfers are not enabled until provider accounts and server-side controls are approved.
Open creator dashboard →
Never pay a fee to unlock demo earnings. A pending request is not a completed bank transfer.
About NaijaClips
NaijaClips is an original short-video app concept. This starter works as a mobile-friendly installable web app, with local video posting, playback, downloads, likes, saves and sharing.
To become a real worldwide social network, the next build needs secure user accounts, cloud video storage and streaming, a shared feed/database, reporting and moderation tools, privacy controls, and a compliant creator monetization/payment system. Views alone do not automatically generate money.
NaijaClips • Original prototype • Be respectful, share responsibly.
Videos are stored locally in this browser. Clearing site data may remove them.
⌂ Home
＋ Post
▣ Saved
# NaijaClips — Android and iOS release guide

## Current state
The repository has `package.json` and `capacitor.config.json` for Capacitor. Native Android and iOS project folders and signed release binaries are not included in this ZIP. A successful app-store release cannot be claimed until the projects are generated, tested, signed, uploaded and approved.

## Requirements
- Node.js/npm and Git.
- Android: Android Studio and Android SDK; a Google Play Console developer account for release.
- iOS: macOS with Xcode for native build/signing, an Apple Developer account, and App Store Connect access.
- A live HTTPS website and working privacy policy, terms, support contact, content reporting, account deletion and moderation process before submission.

## Generate native shells
Run these commands from the extracted project directory on a computer with Node.js/npm installed:

```sh
npm install
npx cap add android
npx cap add ios
npx cap sync
npx cap open android
npx cap open ios
```

Run `npx cap add ios` on macOS with the iOS toolchain available. If a native platform folder already exists, do not add it again; run `npx cap sync` instead.

## Android
1. Open the Android project in Android Studio.
2. Set the final application ID and versioning before release; `com.naijaclips.app` is only the current starter ID.
3. Test signup, uploads, video playback, report flow, download/share behavior, accessibility, network failure, and account deletion on physical Android devices.
4. Create and securely back up a release signing key. Never commit signing credentials to source control.
5. Build a signed Android App Bundle (`.aab`), upload it to an internal testing track, fix all issues, then complete Play Console declarations and request production release.

## iPhone/iPad
1. Open the generated iOS project in Xcode on a Mac.
2. Set a unique bundle identifier, version/build number, signing team, icons and launch settings.
3. Test on physical iPhones/iPads and verify privacy permissions, account deletion, reporting, video uploads, playback, and network interruptions.
4. Archive and upload via Xcode to App Store Connect, use TestFlight, resolve review issues, then submit for App Store review.

## Store policies and content
Because users can post public videos, implement reliable report/block controls, prompt moderation and removal, a copyright/takedown path, clear community guidelines, privacy disclosures, support contact and account deletion. Explain what data is collected and how uploaded videos are used. Complete the current platform privacy/data-safety forms accurately. Do not publish template legal pages unchanged without review.

## Advertising and creator payouts
Do not add live ad IDs or transfer credentials until the relevant provider account is approved. Use test mode, validate server-side earnings and webhook signatures, enforce creator eligibility and payout limits, and reconcile all transfers. Never place provider secrets in the app or browser bundle. Store review is separate from payment-provider approval.
{
  "name": "naijaclips-app",
  "version": "0.3.0",
  "private": true,
  "description": "NaijaClips mobile-first video sharing PWA and native shell starter",
  "scripts": {
    "cap:add:ios": "cap add ios",
    "cap:add:android": "cap add android",
    "cap:sync": "cap sync",
    "cap:open:ios": "cap open ios",
    "cap:open:android": "cap open android"
  },
  "dependencies": {
    "@capacitor/core": "^7.4.3",
    "@capacitor/android": "^7.4.3",
    "@capacitor/ios": "^7.4.3"
  },
  "devDependencies": {
    "@capacitor/cli": "^7.4.3"
  }
}
NaijaClips Privacy Policy
Template — complete and review before publishing. Replace every bracketed item with accurate details.
Effective date: [DATE]
Who operates NaijaClips
[LEGAL BUSINESS NAME], [CONTACT EMAIL], [BUSINESS ADDRESS] operates NaijaClips.
Information collected
Depending on enabled features, we may process account email, profile details, videos and captions you upload, payout details you submit, support messages, device/app diagnostics, and advertising or analytics data from configured providers.
How information is used
We use information to operate accounts, host and display videos, prevent abuse, moderate content, respond to support requests, calculate verified creator earnings, process approved payouts, and meet legal obligations.
Sharing and providers
Data may be processed by hosting, database, storage, advertising, analytics, moderation and payment providers configured by the operator. List actual providers and relevant data transfers here: [PROVIDERS AND TRANSFERS].
Retention and security
Describe retention periods, security measures, and limitations accurately: [RETENTION AND SECURITY]. No online service can promise absolute security.
Your choices and rights
Explain how users can access, correct, export or delete their information, withdraw consent where applicable, and contact the relevant regulator: [USER RIGHTS PROCESS].
Children
Describe the app's age rating, safeguards and policy for minors: [CHILD SAFETY POLICY].
Contact
[PRIVACY CONTACT EMAIL AND ADDRESS]
# NaijaClips — Mobile Video App + Cloud Backend Starter

NaijaClips is an original, mobile-first Progressive Web App (PWA) prototype. It does not copy another platform's branding or assets.

## What's included
- Responsive mobile-friendly interface and installable PWA shell
- Local-device feed: select/post videos, playback, likes, saves, downloads, sharing and deletion
- Optional cloud mode: Supabase email/password accounts, shared public feed, cloud video uploads, playback, downloads, sharing and owner-only deletion
- Supabase database schema, monetization ledger/payout-request tables, community reports and block-list policies
- Corrected creator-balance RPC and serialized payout-request accounting migration
- Cloud-feed report button for signed-in users
- Admin-only payout approval/submission Edge Function starters and signed Paystack webhook starter
- Setup guide, PWA manifest, service worker and icons

## Publish the website
1. Extract this ZIP into a folder.
2. Deploy the folder to Netlify so `index.html`, `cloud.js`, `supabase-config.js`, `manifest.webmanifest`, `sw.js`, `icons/` and `backend/` are at the site root.
3. Local-device mode works without a backend. To enable shared accounts/videos, follow `backend/CLOUD_SETUP.md` and configure `supabase-config.js` first.
4. On iPhone, open the HTTPS website in Safari → Share → Add to Home Screen.

## Important
The cloud mode is an integration scaffold and will not connect until you create/configure your own Supabase project and run the SQL setup. No backend account, cloud storage, production CDN, app-store listing, ads or payouts are included. Never put a Supabase service-role/secret key in client code.

Before public launch, add video transcoding/streaming, quotas/rate limits, content moderation/reporting, copyright takedowns, privacy/terms, account recovery, backups, monitoring, security review and an eligible monetization/payout system. Hosting a website does not automatically create revenue.

## Monetization and store preparation (starter only)
- Open `creator-dashboard.html` for the creator ledger/payout request UI.
- Run `backend/monetization.sql` after `backend/supabase-schema.sql`, then `backend/payout-balance-fix.sql`. Apply `backend/community-safety.sql` for report/block features.
- Review `STORE_AND_MONETIZATION_READINESS.md` and `backend/PAYOUT_AND_MODERATION_SETUP.md` before enabling anything live.
- `privacy-policy-template.html` and `terms-template.html` are templates, not legal-ready documents.
- Capacitor starter files (`package.json`, `capacitor.config.json`) help generate native project shells; Apple/Google submission still requires developer accounts, signing, native testing, provider integrations and review.
# NaijaClips recovered project — deployment next steps

This bundle preserves the existing NaijaClips v7 source package. It is not a new app.

## Known project references
- Existing Netlify site previously shared: https://fancy-centaur-4f0d46.netlify.app
- Existing Supabase project URL: https://lvgpfbjajxytbfyeslcx.supabase.co
- Supabase public anon/publishable key: still needs to be copied from the existing Supabase project.

## Before redeploying
1. In Supabase Dashboard → Project Settings → API (or API Keys), copy the public anon/publishable key.
2. Edit `supabase-config.js` and replace `PASTE_YOUR_SUPABASE_PUBLIC_ANON_OR_PUBLISHABLE_KEY_HERE` with that public key. Never use a service-role or secret key in this browser file.
3. Confirm the SQL in `backend/supabase-schema.sql` and required storage bucket/policies have been applied to the existing project. Do not blindly rerun unrelated migrations without checking current database state.
4. Deploy the extracted site-root contents to the existing Netlify site only after preserving/downloading the current deployed version. Keep `index.html`, `cloud.js`, `supabase-config.js`, `diagnostics.html`, `manifest.webmanifest`, `sw.js`, `icons/`, and `backend/` at the root.
5. Visit `https://fancy-centaur-4f0d46.netlify.app/diagnostics.html` and run the checks.
6. Test sign-up/sign-in, upload a small MP4, view it from a second browser/device, download, report, and owner-only deletion.

## Current limitations
- This archive is recovered from the latest saved NaijaClips project package; it does not prove that the GitHub remote and Netlify deployment are identical to this package.
- The public Supabase key is intentionally not guessed or embedded.
- Ads, real creator earnings/transfers, native Android/iOS signed builds, and app-store approval are not complete. Do not advertise payouts as active until provider setup and end-to-end verification are done.
# NaijaClips v6 — Start here

This is the deployment-ready *web project bundle* for continuing setup. It is not a completed production launch, and it has not been submitted to either app store.

## A. Publish the website on Netlify
1. Extract this ZIP.
2. In Netlify, choose **Add new site / Deploy manually** (or drag and drop the extracted folder's *contents*).
3. Confirm `index.html` is at the published site's root. It must be beside `cloud.js`, `supabase-config.js`, `manifest.webmanifest`, `sw.js`, and the `icons/` folder.
4. Open the HTTPS site and test the local-device video feed.

## B. Connect Supabase cloud feed
1. Create a Supabase project at https://supabase.com/.
2. In **SQL Editor**, run `backend/supabase-schema.sql` first.
3. Run `backend/monetization.sql` next, then `backend/payout-balance-fix.sql`, then `backend/community-safety.sql`.
4. In Supabase **Project Settings → API**, copy the **Project URL** and the **public anon/publishable key**.
5. Edit `supabase-config.js` and replace the two placeholders. The key placed in this browser file must be the public anon/publishable key only. Never place a `service_role`, secret, database password, or Paystack secret key in this file.
6. In Supabase Auth settings, add the exact Netlify HTTPS URL as the Site URL and allowed redirect URL.
7. In Storage, confirm the `clips` public bucket and policies were created by the schema.
8. Test account signup, email confirmation, login, upload, playback and owner deletion on two separate devices/accounts.

**Do not send passwords or secret keys in chat.** If you need help configuring the public settings, share only the project URL and public anon/publishable key. The public key is designed for browser use when Row Level Security policies are correctly configured.

## C. Android and iPhone release preparation
Read `MOBILE_RELEASE_GUIDE.md`. This bundle contains the web app and Capacitor configuration, not prebuilt signed Android/iOS binaries. Native builds, signing, device testing, store account setup, and store review remain required.

## D. Monetization safety
Advertising is not earning revenue until an approved provider is configured and verified ad activity is reported. Creator payouts are not live until the server-side functions, payment-provider test flow, webhook verification, admin access controls and reconciliation are tested end to end. Never use real money until test-mode verification and a security review pass.
# NaijaClips v7 — Cloud MVP + Setup Diagnostics

This is the next deployment-preparation package for the NaijaClips project. It adds `diagnostics.html`, a browser-based setup checker for the Supabase public configuration, API reachability, public `clips` table read access, and Storage bucket access.

## What is included
- Mobile-friendly video-sharing web app and installable PWA shell.
- Supabase email/password authentication, shared public feed, cloud video uploads/playback, owner deletion, and report submission foundation.
- Creator dashboard and monetization/payout database/function starter files.
- Privacy and terms templates, Capacitor configuration, and native-release instructions.
- **New:** `diagnostics.html` to help identify common cloud setup problems after deployment.

## Deploy/update on Netlify
1. Unzip the package.
2. Drag the extracted project contents into the Netlify manual deploy area. Confirm `index.html`, `cloud.js`, `supabase-config.js`, `diagnostics.html`, `manifest.webmanifest`, and `icons/` are at the site root.
3. Open `https://YOUR-SITE/diagnostics.html` and run the checks.
4. If configuration fails, edit `supabase-config.js` with the Supabase Project URL and public anon/publishable key only. Never put secret keys in browser files.
5. Follow `backend/CLOUD_SETUP.md` and `backend/PAYOUT_AND_MODERATION_SETUP.md` to apply SQL and configure server-side functions.

## Required real-device acceptance test
- Sign up with a new email; verify email if enabled; sign in and sign out.
- Upload a short MP4 from one account and confirm it appears in the shared feed.
- Open the live site on another device/account and verify playback.
- Test download, report submission, and owner deletion.
- Test an invalid/oversized file and a failed network connection.
- Check browser console and Supabase logs for errors.

## What is still not complete
This ZIP is not a finished commercial launch. The actual live Supabase project and Netlify deployment cannot be verified from this package alone. Ads are not active, earnings are not generated by demo views, and real creator transfers are not enabled until approved provider credentials, server-side verification, admin controls, and end-to-end test-mode reconciliation are complete. Android/iOS native projects still require generation, signed builds, physical-device testing, store listings, and approval. Complete legal/privacy/child-safety and copyright/takedown policies before opening to the public.
# NaijaClips — Ads, creator payouts and store release readiness

## What this package does now
- Adds `creator-dashboard.html` for account sign-in, payout profile entry, earnings ledger viewing and payout requests.
- Adds `backend/monetization.sql`: creator earnings ledger, private bank profile, payout request table, row-level security and an atomic payout-request RPC. Minimum request is ₦5,000.
- Keeps earnings writes server-side only. The browser cannot mint its own earnings.
- Adds a Capacitor starter configuration for native iOS/Android project generation.
- Adds privacy and terms templates that must be reviewed and completed before public launch.

## What is NOT live yet
No advertising network has approved this publisher/app; no live ads are shown; no real earnings are imported; no payout transfer is made; no App Store or Google Play submission has been uploaded. Do not advertise the app as paying creators until real provider integration, review, and end-to-end payout tests pass.

## Backend setup
1. Create a Supabase project and follow `backend/CLOUD_SETUP.md`.
2. Run `backend/monetization.sql` and then `backend/community-safety.sql` after `backend/supabase-schema.sql`. See `backend/PAYOUT_AND_MODERATION_SETUP.md` for the Edge Function starter and secret setup.
3. Deploy the site over HTTPS and configure `supabase-config.js` with only the public anon/publishable key. Never expose service-role keys or payment-provider secret keys in browser code.
4. Open `/creator-dashboard.html`, create/sign in to an account, save a test payout profile, and verify that payout requests are blocked without a confirmed ledger balance.
5. Add a trusted server-side admin workflow for reviewing payout requests. Do not grant creators permission to insert/update earnings or mark payouts paid.

## Advertising integration (requires account approval)
- Website ads: apply to an appropriate web publisher product (for example, Google AdSense) and wait for approval. Only add the exact publisher script/ad units issued to the approved site; configure consent where required; never encourage clicks or place ads to mislead users.
- Native app ads: when packaging the native app, use a supported mobile ads SDK such as Google Mobile Ads (AdMob) in the native iOS/Android layer. Register each app, use test ad unit IDs during development, then replace with production IDs only after approval. Do not simply paste a web AdSense script and assume it serves native app ads.
- Video feed: decide ad format and frequency carefully. Follow provider rules for rewarded/interstitial ads and disclose incentives. Protect children and sensitive content, support reporting/takedowns, and monitor invalid traffic.
- Revenue accounting: import provider statements/earnings from a trusted server-side integration or reconciled reports. Creator share, platform share, thresholds, reversals, taxes and dispute rules must be documented before any balance is displayed as payable.

## Creator payouts in Nigeria
- Choose a licensed payment provider and complete business/KYB onboarding. Paystack Transfers or another approved provider may be suitable depending on the account's eligibility and provider rules.
- Obtain verified bank-code/account-name resolution and test credentials. Store secret keys only in server-side secrets (Supabase Edge Function secrets or equivalent).
- Build admin-only payout approval and a server-side transfer worker with idempotency keys, provider webhook signature verification, retry handling, daily limits, audit logs and reconciliation. Never transfer automatically based only on a browser request.
- Confirm creator identity/KYC requirements, fraud/invalid-traffic holds, minimum payout, fees, tax handling, refund/reversal rules, privacy notices and support process with legal/payment advisers.
- Test the complete lifecycle with provider test mode before enabling live payouts. A request shown as `pending` is not a completed transfer.

## iOS App Store and Google Play
This folder is a PWA. Store release requires native projects, developer accounts, signed builds, policy-compliant privacy disclosures and review. To generate native project shells:
1. Install Node.js LTS and a current npm.
2. Run `npm install` in this folder.
3. Run `npm run cap:add:ios` on a Mac with current Xcode, and `npm run cap:add:android` with Android Studio/SDK installed.
4. Run `npm run cap:sync`, then open iOS in Xcode and Android in Android Studio. Configure bundle/package IDs, signing, app icons/splash screens, HTTPS domain behavior, deep links, permissions and ads SDKs.
5. Test on real devices: account creation/login, upload failure recovery, video playback on mobile networks, download/share, account deletion, privacy choices, ad consent, content reporting, blocking, moderation and payout states.
6. Submit via App Store Connect and Google Play Console using your own developer accounts. Approval and release are controlled by Apple/Google; this package cannot bypass their review.

## Launch gate checklist
- [ ] Replace all template privacy/contact/legal text with real business details and publish public privacy + terms URLs.
- [ ] Complete account deletion and data export workflows required by platform rules.
- [ ] Add report content/user, moderation queue, copyright takedown, age/content safeguards and community guidelines.
- [ ] Use secure streaming/transcoding/CDN and upload quotas; current starter uploads directly to Supabase storage and is not a large-scale video pipeline.
- [ ] Configure backups, logs, rate limits, monitoring, security review and incident response.
- [ ] Obtain ad network approval and verify live test ads on approved devices.
- [ ] Complete payment-provider onboarding, payout approvals, reconciliation and test-mode transfer tests.
- [ ] Run privacy/security review and store metadata/screenshots before submission.
/* NaijaClips cloud configuration.
   Supabase project URL and public publishable key.
   This key is intended for browser use when Row Level Security policies are configured.
   NEVER put a service_role/secret key in browser code.
*/
window.NAIJACLIPS_SUPABASE = {
  url: 'https://lvgpfbjajxytbfyeslcx.supabase.co',
  anonKey: 'sb_publishable_IodssB9DUB9stpFMi9rAjA_GSss5Dtn'
};
const CACHE='naijaclips-shell-v2';
const CORE=['./','./index.html','./cloud.js','./supabase-config.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok&&event.request.destination!=='video'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match('./index.html'))))});
NaijaClips Terms of Use
Template — obtain legal review and replace bracketed details before launch.
Effective date: [DATE]. Operator: [LEGAL BUSINESS NAME, CONTACT DETAILS].
Eligibility and accounts
Set the minimum age, account rules, password security requirements and account termination process: [ELIGIBILITY AND ACCOUNT RULES].
User content
You retain rights you hold in your uploads and grant only the limited hosting/display licence needed to operate the service. Do not upload content you do not own or have permission to share. Specify copyright complaint/takedown process: [COPYRIGHT PROCESS].
Safety and enforcement
Prohibit illegal content, harassment, exploitation, impersonation, spam, fraud and attempts to manipulate advertising. Describe reporting, blocking, moderation and appeals: [COMMUNITY RULES].
Ads and creator earnings
Ads may not be available to every user or region. Earnings are based only on verified provider data and may be adjusted for invalid traffic, reversals, fees or legal requirements. Eligibility, thresholds, taxes, review holds and payout timing must be published in a separate creator policy: [CREATOR MONETIZATION POLICY]. No income is guaranteed.
Availability and liability
Describe service availability, user responsibilities, dispute resolution and legally permitted liability limits with local legal advice: [LEGAL TERMS].
Contact
[SUPPORT EMAIL]

export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_PUBLIC_KEY";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from "./supabase-config.js";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("NaijaClips Supabase client initialized.");
