/* Подключение к ВАШЕЙ НОВОЙ базе Supabase (отдельный проект для Avito Türk).
   1) Создайте проект на supabase.com  2) Settings → API  3) вставьте Project URL и anon public key.
   Пока поля пустые, приложение работает автономно (данные только в браузере), без связи с какой-либо базой. */
window.AVITO_CONFIG = {
  SUPABASE_URL: "https://ilpwbpeznuqoyajipooc.supabase.co/rest/v1/",        // например: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlscHdicGV6bnVxb3lhamlwb29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDA5MzksImV4cCI6MjEwOTQ3NjkzOX0.VHqI4I4n70Ju2UkY_F7Fa2W4BurPgEsOKPQlZLVWVVA",   // anon public key нового проекта
  USE_PROXY: false         // true — ходить через /supabase-api на вашем домене (нужен rewrite в vercel.json)
};
