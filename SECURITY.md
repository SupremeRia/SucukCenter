# Güvenlik

İşletme kayıtları yerel SQLite dosyasında saklanır; otomatik bulut/API aktarımı yoktur. Belgeler yolu işletim sisteminden alınır. Windows/OneDrive ayrıca eşitleme yapabilir. Veritabanı şifreli bir kasa olarak sunulmaz; Windows hesabınızın ve diskinizin erişim güvenliğini koruyun.

Renderer için nodeIntegration kapalı, contextIsolation ve sandbox açıktır. Dosya/veritabanı işçisi yalnız doğrulanan sınırlı IPC üzerinden kullanılır. Harici navigasyon ve ağ istekleri kapalıdır. CSP yerel font/ikonlarla çevrimdışı çalışır. Açılışın kendi preload’u yalnız tek hazır-kare bildirimi yollar; başka dosya veya veri API’si içermez.

İşlem anahtarları, immutable mali geçmiş, foreign key, tam sayı para/miktar, transaction, WAL/checkpoint ve doğrulanmış yedek kuralları korunur. Bilinmeyen bir dosyayı yedek diye kabul etmeyin; uygulama bütünlük ve hesap mutabakatı doğrular.

## Windows uyarıları ve imza

Kullanıcının bildirdiği “SmartScreen program güvenilir olmayabilir” metni itibar/güven uyarısıdır. Bir Defender zararlı yazılım tespit adı verilmemiştir. SmartScreen, Smart App Control ve Defender tespiti ayrı değerlendirilmelidir.

Bu önizleme CN=RiaCoding yerel test sertifikasıyla imzalıdır. Güvenilir üretim sertifikası mevcut değildir. Sertifika başka bilgisayarın güven deposuna yüklenerek çözüm üretilmez. Windows korumalarını kapatma, istisna veya engel aşma talimatı verilmez. Dosya şüpheli görünürse çalıştırmayın; tam uyarı/tespit adı, sürüm ve SHA-256 ile bildirin. Dosya üçüncü tarafa izinsiz yüklenmez.

Üretim imzası için güvenilir kod imzalama sertifikası/hizmeti ve doğrulanmış yayıncı erişimi gerekir; satın alma otomatik yapılmaz. Geçerli imza da SmartScreen’in bütün bilgisayarlarda kesin susacağını garanti etmez. [Microsoft SmartScreen açıklaması](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [kod imzalama seçenekleri](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

## Bildirim

Önce yayınlanan sürüm notları ve SHA256SUMS ile sürümü doğrulayın. Public issue’ya gerçek müşteri, işletme veritabanı, yedek, parola veya kişisel kayıt koymayın. Genel hata için yalnız sentetik yeniden üretim paylaşın. Henüz özel güvenlik bildirim kanalı tanımlanmamıştır; hassas ayrıntıyı public alana göndermeden depo sahibinden özel kanal isteyin.
