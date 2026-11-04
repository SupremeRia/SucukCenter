> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.6.0 — arama, kayıt menüleri, arşivleme ve düzeltmeler

01.11.2026 · Şema 8. Testler yalnız geçici klasörlerdeki sahte işletme verileriyle yapıldı. Gerçek Belgeler veritabanında kurulum, test veya geçiş yapılmadı.

## Değişen davranış

Aramada odak kaybı gerçek Electron'da yeniden üretildi: `Ahmet uzun firma` metni tek tıklamayla yazılırken giriş `Ah` değerinde kalıyor, odak kutudan çıkıyordu. Kök neden sorgu sırasında bütün ekran bölümüne `hidden` uygulanmasıydı. Bölüm artık yükleme sırasında gizlenmiyor; arama kutusu aynı DOM öğesi olarak kalıyor. Yeni sonuç gelene kadar mevcut ekran ve yükleme bilgisi gösteriliyor. Her tuşta zorla odak verme yok. İstek sıra numarası eski sonuçları ve eski hataları geçersiz kılıyor.

Ürün, müşteri, tedarikçi, satış, tahsilat, finans ve cari hareket tablolarında kayda bağlı sağ tık ve görünür üç nokta menüleri var. İşlem geçmişi ve teslimat hareketlerinde de menüler sunuluyor. Menü ekran sınırlarında açılır; tablo satırında Shift+F10, menüde ok/Home/End, Enter ve Escape çalışır. Escape odağı satıra döndürür. Geçersiz işlem seçildiğinde ilgili bağlantı ve izlenecek adım gösterilir.

Ürün/müşteri/tedarikçi için:

- Hareketsiz kartın adı ve etkisi açıkça gösterilerek kalıcı silme onayı alınır.
- Bağımlılıklar veritabanının foreign key tanımlarından arka uçta denetlenir. Finansal/stok kayıtları zincirleme silinmez.
- Hareketli kart arşivlenebilir. Varsayılan listelerden ve yeni işlem seçimlerinden kalkar; geçmiş belgeler ve yükümlülükler korunur.
- “Arşivlenenleri göster” ve “Yeniden etkinleştir” bulunur. Kaldırma ekranında stok, para bakiyesi ve bekleyen ürün yükümlülüğü gösterilir.
- Arşivlenmiş müşterinin hesabından tahsilat/iade yapılabilir; arşivlenmiş müşteri ve ürünün mevcut siparişi teslim edilebilir. Yeni satış/alış/ön sipariş için kart etkin olmalıdır.
- Kartların silinmesi, oluşturma ve silme faaliyetlerini silmez. Eski kimlikler yeni kartlarda tekrar kullanılmaz.
- Ürün birimi hareket veya sipariş sonrasında değiştirilemez. Fiyat güncellemesi eski satışa ve sabit sipariş fiyatına uygulanmaz. Karttan stok üzerine yazılmaz.

## Geçmişi koruyan düzeltme

Tahsilat, satış, alış, gider, para iadesi, cari ekleme ve bağımsız tedarikçi ödeme/iadesi mevcut değerlerle açılır. Gerekçe zorunludur. Kaydetmeden önce eski/yeni tutar, firma, işlem tarihi, stok ve cari net farkı, kasa farkı ve etkilenen maliyet dönemleri karşılaştırılır.

Özgün kayıt korunur. Ters kayıt ve düzeltilmiş yeni kayıt tek `BEGIN IMMEDIATE` transaction içinde oluşturulur. `corrections` tablosu özgün/ters/yeni kayıt bağlantılarını, önceki/yeni değerleri, gerekçeyi ve değişmez programa giriş zamanını saklar. Listede özgün kayıt “Düzeltildi” görünür; üç nokta → Görüntüle altında zincir ve yeni kayıt bağlantısı bulunur. Cari ekstre, kasa ve dönem raporları aynı ters/yeni hareketleri kullanır.

Yeni kayıt geçersizse stok, cari, kasa, maliyet sürümleri, faaliyet ve düzeltme bağlantıları birlikte geri alınır. Kalıcı işlem anahtarı yeniden gönderimde ikinci düzeltme oluşturmaz. Kayıt/bağlantılar form açıldıktan sonra değişmişse güncel kontrol anahtarıyla reddedilir; taslak korunur. Finansal formda güncel özgün kaydı yeniden yükleyip karşılaştırmayı tekrar inceleme düğmesi vardır.

Yanlış kayıt düzeltmesinde ters etki özgün işlem gününe, yeni etki seçilen doğru güne yazılır. Gerçek iade/iptal mevcut ayrı akışından kendi gerçekleştiği güne kaydedilir. Kronolojik stok/maliyet yeniden hesaplanır; herhangi bir tarihte negatif stok reddedilir. Sonraki dönem maliyet değişiklikleri için mevcut önizleme ve onay mekanizması korunur. Önceden dışa aktarılmış dosyalar değiştirilmez.

## Bağlı işlemlerin sınırları

- Ödemesi veya başka hareketi olmayan ön sipariş iptal/yeni sipariş bağlantısıyla düzeltilebilir.
- Son hareket olan, ödeme bağlı olmayan teslimatın miktar/tarih/açıklaması ters teslimat ve yeni teslimatla düzeltilebilir. Başka siparişe taşınmaz.
- Siparişe ayrılmış tahsilatın düzeltmesi engellenir; önce ödeme bağlantısını kaldırma adımı açıklanır.
- Kısmen teslim edilmiş/ödemesi bağlanmış siparişte otomatik toplu düzeltme yapılmaz. Ödeme bağlantısını kaldırma, gerekiyorsa fiziksel iade, kalan siparişi iptal ve yeni sipariş/teslimat adımları kullanılır. Para ve ürün yükümlülükleri iki kez oluşturulmaz.
- Sonrasında sipariş hareketi veya bağlı ödeme bulunan teslimatta ilgili iade/bağlantı akışı gösterilir.
- Bağlı ödeme/iadesi bulunan alışta bu belgeler önce incelenir/iptal edilir. Tüketilmiş stok güvenle ters çevrilemiyorsa işlem reddedilir; tedarikçiye iade akışına yönlendirilir.
- Mevcut tam iade kuralı korunur: fiziksel iade seçilen teslimat kaydının tamamıdır; tek teslimatın parçalı fiziksel iadesi eklenmedi.

Bunlar veri bütünlüğünü koruyan açık sınırlardır; desteklenmeyen bağlı işlemler doğrudan değiştirilmez.

## Migration ve güvenlik

Şema 7 → 8 geçişi öncesinde SQLite backup yöntemiyle doğrulanmış yedek alınır. Müşteri/tedarikçiye aktiflik alanı, değişmez düzeltme ve silme izi tabloları eklenir. Faaliyet satırları ve tarihleri korunur; hareketi olmayan müşteri kartı silinirken geçmiş faaliyet kimliği saklanabilir. Operasyonel ilişkilere ait foreign key denetimi aktiftir. Yeni `record` preload metodu yalnız doğrulanmış tür/kimlik kabul eder; dosya sistemi veya SQL erişimi açmaz. IPC güvenilir pencere/ana frame denetimi korunur.

## Doğrulama

- `npm run build`: typecheck, ana süreç ve üretim arayüzü derlemesi.
- `npm run lint`: başarılı.
- `npm test`: **76/76**; yeni 8 senaryo dahil.
- Tahsilat 100 → 150 TL: kasa ve cari net farkı yalnız 50 TL.
- Tahsilatın müşteri değişimi: eski/yeni bakiyeler ve tek kasa etkisi.
- Satış 10 → 8 kg: net stok +2 kg, tutar ve maliyet doğru; yetersiz/tarihsel negatif stokta özgün işlem korunur.
- Eski form, mükerrer anahtar, son adımda zorlanan hata, yedek/geri yükleme ve yeniden açılış.
- Geçmiş satış düzeltmesinin sonraki ay maliyetine etkisi: salt okunur önizleme, onaysız ret, onaylı kayıt ve mutabakat.
- Hareketsiz kart silme, kimlik tekrarını engelleme, geçmişli kart silmeyi reddetme, arşiv/aktif liste/geri etkinleştirme.
- Ödeme bağlı kısmi siparişte düzeltmeyi reddetme ve arşivlenmiş kartın mevcut teslimatını tamamlama.
- `test:records-ui`: gerçek Electron; uzun klavye girişi, Türkçe metin ekleme (`keyboard.insertText`), seçili metni değiştirme, ortadan yazma ve imleç, 120/700 ms gecikmeli ve ters sırada dönen sorgular, sıfır sonuç, odağı başka alandan geri çalmama; altı liste araması; sağ tık/üç nokta/klavye; sil/arşiv/etkinleştir; tahsilat ve satış düzeltme; hatada taslağı koruma; dar ekran menü sınırları; çevrimdışı. Sistem panosunun içeriği değiştirilmedi.
- `test:ui`, `test:accounts-ui`, `test:preorders-ui`, `test:choices-ui`: mevcut temel akışlar, hesaplar, sipariş/teslimat, başlık sıralaması ve ortak seçim listeleri başarılı.
- `test:upgrade-data`: arşivlenmiş gerçek **1.5.1 ASAR kodu** ile sahte veriler oluşturuldu; yeni kodda şema 8'e geçiş, doğrulanmış geçiş yedeği, kart/bakiye/ayarlar ve ödeme bağlı kısmi teslimatın korunması kontrol edildi. Geçiş sonrası düzeltme yeniden açılışta korundu. Eski kod yeni şemayı reddetti.

**Paketlenmiş Electron (`packaged=true`) yeni arama/menü/düzeltme testi ve üretim ASAR içerik kontrolü başarılı.** Son kontrol çıktıları `artifacts/records-ui-packaged.log`, `artifacts/records-package-test.log` içinde tutulur. Çalıştırılabilir inceleme paketi ayrı geçici Belgeler klasörünü zorunlu tutar; bu test girişi üretim paketine eklenmez.

## Kurulum ve yerinde yükseltme

Dosya: `review-builds/signed/SucukCenter-1.6.0-RiaCoding-Kurulum.exe`

**Aynı dosya tam kurulum ve mevcut kurulumu kaldırmadan yerinde yükseltme içindir.** Delta güncelleme veya ayrı bir güncelleme servisi değildir.

1. Mevcut uygulamada isterseniz Ayarlar → Yedek Oluştur ile bir yedek alın.
2. SucukCenter'ı normal biçimde kapatın.
3. Bu `.exe` dosyasını çalıştırın; mevcut kurulumun kullanıcı hesabı/klasörünü kullanın. Önceki sürümü kaldırmanız gerekmez.
4. Yeni sürümü açın. Veriler Windows'un döndürdüğü Belgeler/SucukCenter yolunda kalır; migration önce güvenli geçiş yedeğini alır.

Uygulama çalışıyorsa kurucu zorla sonlandırmaz, kapatmanızı ister. Kullanıcı ayrıca Node.js/veritabanı sunucusu kurmaz. Temel kullanım çevrimdışıdır.

SHA256: `AE80DD317A7A54E004AD4275BA5620602314F22774F2701C7912E2529ADF1A96`

Boyut: **134951512 bayt**. İmzalayan **CN=RiaCoding**, SHA256 ve DigiCert zaman damgası doğrulandı. Bu kullanıcı onaylı **yerel test sertifikasıdır**; Windows sertifika kökü güvenilir değildir (`UnknownError`). Ticari yayıncı güveni/SmartScreen uyarısının kalktığı iddia edilmez.

**Fiziksel NSIS kurulumu/yükseltmesi, kayıt defteri ve kısayollar ayrı bir Windows test ortamında çalıştırılmadı.** Doğrulanan önceki sürüm geçişi gerçek eski/yeni uygulama koduyla izole veritabanı/runtime geçişidir. Gerçek işletme verisine kendiliğinden kurulum yapılmadı.
