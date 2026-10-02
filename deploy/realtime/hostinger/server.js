// Race Rush production entry for Hostinger managed Node hosting.
process.env.HOST = '0.0.0.0';
process.env.ALLOW_ANONYMOUS = 'false';
process.env.API_URL = 'https://racerush.pro.mr';
if (!process.env.RACERUSH_REALTIME_SECRET) throw new Error('RACERUSH_REALTIME_SECRET must be configured before startup');
require('./realtime.cjs');
