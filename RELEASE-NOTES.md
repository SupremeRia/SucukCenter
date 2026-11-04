# SucukCenter 1.8.0-rc.1 — 05.11.2026

**Ön sürüm / Windows x64.** Kararlı sürüm değildir; tamamlanmamış fiziksel Windows kontrolleri aşağıdadır.

## Değişiklikler

- 68 px hızlı erişim şeridi ve daraltılabilir, gruplu modül menüsü.
- 20 tema; sistem tercihi, anlık önizleme, uygula/vazgeç ve şema 11'de kalıcı ayar.
- Sağlanan SC program ikonu ve ayrı tam yazılı şeffaf açılış logosu. En az 7 saniye ve gerçek UI/veri hazırlığını birlikte bekleyen açılış; hata/yeniden deneme/çıkış ve ikinci süreç desteği.
- Harf içi boşlukları koruyan native alfa pencere maskesi. Kullanılan setShape API'si deneysel; gerçek fare geçişi henüz doğrulanmadı.
- Takvim kapanışının yeni ürün aramasından odağı çalması yeniden üretildi ve kök nedeninde düzeltildi; regresyon testi eklendi.
- Üretim sertifikası ön kontrolü ve güvenli imzalama yapılandırması. Önceki finans, gider, stok, cari ve ön sipariş kuralları korundu.

## İndirme ve güncelleme

`SucukCenter-1.8.0-rc.1-RiaCoding-Kurulum.exe` **136.859.616 bayttır**. Tek dosya hem tam kurulum hem mevcut kurulumu kaldırmadan yerinde yükseltme içindir; ayrıca ikinci bir güncelleme paketi yoktur. Kaynak ZIP'i kurulum değildir.

1. Mevcut uygulamada Ayarlar → Yedek Oluştur ile güvenli yedek alın.
2. Uygulamayı kapatın. Aynı kurulum konumunu hedefleyen EXE'yi çalıştırın; önceki kurulumu kaldırmayın.
3. Müşteri/stok/ürün borcu/gider/ayarları kontrol edin. Veri şeması 11'e yükselir. Eski uygulamayı yeni şemaya zorlamayın; geri dönüş için önceki sürüm ve o sürümde alınmış yedek gerekir. Ayrıntılar UPDATE.md içindedir.

Fiziksel NSIS yükseltmesi izole VM'de henüz test edilmedi. Gerçek 1.7.0 kodundan sentetik veri geçişi test edildi; ikisi aynı kontrol değildir. Gerçek işletme bilgisayarına otomatik kurulum yapılmadı.

SHA-256:
`CF359B0C54284A84C2AC66365BFF7B9075963EA36FCEF1AE517FE341D6F766FD`

## İmza ve Windows uyarısı

Uygulama, kurulum ve kaldırıcı **CN=RiaCoding yerel test sertifikasıyla** SHA-256 ve DigiCert zaman damgası taşır. Sertifika kendinden imzalıdır; güvenilir üretim sertifikası değildir ve Windows güven zinciri testi başarılı değildir. SmartScreen uyarısının kaldırıldığı iddia edilmez. Üretim imzalama için güvenilir sertifika veya imzalama hizmeti erişimi gereklidir. Windows güvenlik ayarlarını değiştirmeyin; başka bilgisayara test kökü yüklemeyin.

## Doğrulama ve sınırlar

Lint, typecheck, üretim derlemesi ve 86/86 veri testi geçti. Kaynak/paketli Electron'da 20 tema, seçim/takvim/odak, finans/gider/ön sipariş ve yedekleme/geri yükleme regresyonları geçti. %100/%125/%150 Electron ölçeği ve üç pencere boyutunda ilgili testler yapıldı; her tema için tüm çapraz kombinasyonlar test edilmedi. ICO'nun yedi boyutu uygulama/kurulum/kaldırıcı PE kaynaklarında doğrulandı.

Splash ilk çizimden sonra normalde 7.187 ms; gecikmiş hazırlıkta 8.961 ms açık kaldı. İkinci süreç, bozuk DB ve eksik logo akışları geçti. Kısa WebM kaydı Electron sayfa içeriğidir; native şeffaflığın/tıklamanın kanıtı değildir.

**Doğrulanamayanlar:** Native C içi/harf arası/şeffaf alan fare geçişi; yakalama zaman aşımı ve giriş geometrisi hatası nedeniyle kontrollü OS tıklaması gönderilemedi. Ayrıca fiziksel NSIS temiz kurulum/yerinde yükseltme, kurulu kısayol ikonları, Windows 11, OS DPI ve çoklu monitör kontrolleri tamamlanmadı. Bunlar nedeniyle yayın prerelease olarak işaretlidir. Ayrıntı: TEST-RESULTS.md.

Kaynak ve ekran görüntüleri sentetiktir; işletme veritabanları, yedekler ve imzalama anahtarları yayına dahil değildir. Projeye yeni bir lisans atanmadı.
