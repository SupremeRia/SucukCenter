# Yeni bilgisayara kurulum

1. [Resmî 1.8.0-rc.1 Release sayfasından](https://github.com/SupremeRia/SucukCenter/releases/tag/v1.8.0-rc.1) **SucukCenter-1.8.0-rc.1-RiaCoding-Kurulum.exe** dosyasını indirin. “Source code” ZIP’i kurulum dosyası değildir.
2. Release’teki SHA256SUMS.txt ile dosyanın SHA-256 özetini karşılaştırın: PowerShell’de `Get-FileHash -Algorithm SHA256 -LiteralPath .\SucukCenter-1.8.0-rc.1-RiaCoding-Kurulum.exe`.
3. Bu paket bir önizlemedir ve yerel test sertifikası taşır. Windows tarafından engellenirse güvenlik korumasını kapatmayın, istisna eklemeyin ve engeli aşmayın; güvenilir üretim imzalı sürümü bekleyin veya yayıncıya uyarının tam metnini bildirin.
4. Kuruluma izin veriliyorsa sihirbazı izleyin; masaüstü/Başlat menüsü kısayolunu seçin. Node.js veya ayrı veritabanı kurmayın.
5. İlk açılışta logo en az yedi saniye görünür. Ana ekran ve veriler hazır olmadan geçilmez. İlk kullanım boş veritabanıyla başlar.

Veriler gerçek Belgeler/SucukCenter klasöründe saklanır. İlk kurulum ve NSIS sihirbazı bu ortamda fiziksel olarak doğrulanmadı. Başka bilgisayardan veri taşımak için eski bilgisayarda Ayarlar → Veriler ve yedekleme → Yedek Oluştur; yeni bilgisayarda Yedekten Geri Yükle kullanın. Çalışan veritabanı dosyasını doğrudan kopyalamayın.
