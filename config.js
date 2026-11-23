// =====================================================================
//  KONFIGURASI APLIKASI
//  Isi dengan data dari Supabase Dashboard → Project Settings → API.
//  - SUPABASE_URL      : "Project URL"
//  - SUPABASE_ANON_KEY : "anon public" key (atau "publishable key")
//
//  Kunci anon/publishable AMAN ditaruh di sini karena semua akses data
//  dijaga oleh Row Level Security di database.
//  JANGAN PERNAH menaruh "service_role" / "secret" key di file ini.
//
//  Jika memakai GitHub Actions + Secrets, file ini akan ditimpa otomatis
//  saat deploy (lihat .github/workflows/deploy.yml).
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: 'https://fkgecwhtaaqoqlgxohgi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_sTsz9pK4YuihyPYKcoIRag_SaBNXNgJ',
  APP_NAME: 'Absensi QR',
};
