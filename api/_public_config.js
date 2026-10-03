'use strict';

// Browser-safe/public runtime identifiers only. Never put service-role or secret keys here.
// Supabase publishable keys are intentionally usable by public clients; authorization remains
// enforced by database grants/RLS/RPC contracts.
module.exports = Object.freeze({
  supabaseUrl: 'https://frhletkiuupgksmgxoxc.supabase.co',
  supabasePublishableKey: 'sb_publishable_JQPnalB8jOs639_PWoR6mA_AOk11xWC',
  publicOrigin: 'https://dpp-autopilot.vercel.app'
});
