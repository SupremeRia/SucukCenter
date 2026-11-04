> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.5.0 — ön sipariş, ürün yükümlülüğü ve müşteri sıralaması

31.10.2026 · Şema 7 · Windows x64. Gerçek işletme verisi açılmadı veya değiştirilmedi; kendiliğinden kurulum/yayın yapılmadı.

## Kullanım

Müşteri detayında **Cari işlem → Alacak ekle** artık **Para alacağı** ve **Ürün alacağı — müşteriye teslim edilecek ürün** seçeneklerini açar. Ürün kaydında müşteri, ürün, miktar, karttan alınan birim, işlem tarihi, kaynak, zorunlu açıklama, referans ve isteğe bağlı planlanan teslim günü bulunur. Kg/Litre binde bir, Adet tam sayı kabul eder. Stok bulunması gerekmez; kayıt stok düşürmez.

**Ön ödemeli sipariş:** anlaşılan birim fiyat ve ilk toplam bedel kayıt üzerinde sabittir. Ürün kartının fiyatını değiştirmek mevcut sözleşmeyi değiştirmez. İptal edilen miktar varsa ilk bedel ve iptal sonrası bedel ayrı gösterilir. Ödeme ve teslim durumları bağımsızdır: Ödenmedi/Kısmen ödendi/Ödendi ve Teslim bekliyor/Kısmen teslim edildi/Tamamlandı/İptal.

**Diğer ürün borcu:** açıklama ile ürün yükümlülüğü oluşturur; para borcu, tahsilat veya satış yaratmaz. Tesliminde stok maliyeti nakit gideri veya bedelli satış olarak kaydedilmez; aylık/yıllık ayrıntılı raporda **Diğer ürün borcu teslim maliyeti** adıyla ayrıdır ve dönem faaliyet sonucunda düşülür. Brüt satış kârının içinde değildir.

### Ödemeler

Sipariş satırındaki **Ödeme bağla** üç yol sunar:

1. **Yeni ödeme al ve bağla:** gerçek tahsilat ve tek kasa girişi. Siparişe yalnız kalan bedel kadar tahsis edilir; fazla kısım genel müşteri para hesabında kalır.
2. **Kullanılabilir para avansından ayır:** serbest avans azalır, siparişe ayrılmış ödeme artar; kasa değişmez.
3. **Mevcut tahsilatı bağla:** aktif, aynı müşteriye ait tahsilat seçilir. Bağlanabilir tutar, arama ve sayfalama sunulur. Kasa tekrar artmaz. Daha önce teslim edilmiş bedeli kapatan tahsilat da bağlanabilir; ikinci cari borç oluşturulmaz.

Kalıcı tahsis kaynak hareketleri aynı tahsilatın aynı tutarının iki siparişte yeniden kullanılmasını engeller; kullanılabilir genel avans da ana cari bakiyeyle denetlenir. Sipariş bedeline ayrılmış fakat teslimde henüz kullanılmamış para, serbest para alacağından ayrıdır. Yeni ödeme önceden yapılmış satış sayılmaz ve kâr oluşturmaz.

Müşteri ekranı **para borcu**, **kullanılabilir para alacağı/avansı**, **siparişlere ayrılmış ödeme** ve **teslim edilecek ürünleri** ayrı gösterir. Ürün miktarı güncel fiyatla para bakiyesine çevrilmez; farklı ürünler veya birimler toplanmaz.

### Teslim ve düzeltme

**Ürün teslim et**, ilgili kayıt numarası, ürün, kalan miktar, mevcut fiziksel stok, miktar, gün ve açıklamayı gösterir. Kalan yükümlülüğü veya fiziksel/tarihsel stoku aşamaz. Kısmi teslim aynı siparişten sürer. Ön sipariş teslimi mevcut satış/kalem/stok/maliyet altyapısında **tek** satış oluşturur; ayrılmış ödeme bu satışa uygulanır. Tekrar kasa girişi yapılmaz. Ödenmemiş teslim bedeli genel cari hesaba borç olur. Stok çıkışı mevcut kronolojik ağırlıklı maliyet motorunu kullanır.

Kısmi bedeller kuruş cinsinden hesaplanır; son teslim kalan bedeli kapatır. Birden fazla fiziksel iadeden sonra da tutar negatif kuruşa düşmez. Her teslimin asıl bedeli, birim fiyatı ve stok maliyeti izlenebilir; daha sonra gelen mal eski sözleşme fiyatını değiştirmez.

- **Kalanı iptal et:** yalnız teslim edilmemiş miktarı gerekçeyle kapatır. Kullanılmamış fazla tahsis serbest avansa döner. Stok ve kasa değişmez. Para vermek gerekiyorsa ayrıca **Para iadesi yap** kullanılır.
- **Sipariş hareketleri → Fiziksel iade:** seçilen teslim kaydının tamamını, ürünün gerçekten geri alındığı onayı ve gerekçeyle ters çevirir. Stok/maliyet, bağlı satış ve ürün yükümlülüğü birlikte düzelir. Teslimden sonra alınan ödeme de doğru biçimde yeniden tahsise döner. Bir teslimin bir bölümünü geri almak için teslimleri uygun parçalara ayırarak kaydetmek gerekir; bu sürümde iade, seçilen teslim kaydının tamamınadır.
- Bağlı satış sıradan satış iptali düğmesinden geri alınamaz; anlaşılır hata fiziksel iade yoluna yönlendirir.
- **Bağlantıyı iptal et:** kalan ödeme bağlantısını ters kayıtla kaldırır; henüz kullanılmamış kısmı serbestleştirir. Teslimde kullanılmış ödeme genel cari hesapta kalır. Gerçek tahsilat ayrıca iptal edilirse, teslim edilmiş ürün müşteride kalırken parasal borç doğru artar; bunun için fiziksel iade zorlanmaz. Bağlı tahsilat, bağ çözülmeden iptal edilemez.
- Tekrar teslim/iade/iptal aynı işlem anahtarıyla geldiğinde kayıtlı sonuç döner. Yeni anahtarla aşırı miktar ve tekrar iade reddedilir. Kaynaklar silinmez; ters olaylar ve açıklamalar kalır.

Geçmiş işlem günü seçilebilir; gelecek işlem yasaktır, planlanan teslim günü gelecekte olabilir. **Bir siparişin hareketi o siparişin daha önce kaydedilmiş son işlem gününden önceye eklenemez.** Böyle bir düzeltmede sonraki kayıtları ters işlemle ele alın. Bu sıra kuralı tahsis ve kuruş hesabını korur. Geçmiş güne teslim girildiğinde diğer stok hareketleri mevcut kronolojik stok/maliyet kontrolü ve gerekiyorsa maliyet önizleme/onayıyla çalışır. Asıl kayıt zamanı ayrıca saklanır.

### Bekleyenler, ekstre ve sıralama

Sol menüde **Bekleyen Teslimatlar**; müşteri/ürün/referans, sipariş tarih aralığı, planlanan teslim tarih aralığı ve yalnız bekleyenler filtresi sunar. Tüm eşleşen kayıtlardan ürün/birim bazında bekleyen toplamlar hesaplanır; fiziksel stok ayrı sütundur. Liste, sipariş hareketleri ve mevcut tahsilat seçimi sayfalıdır.

Müşteri aylık ekstresi sipariş, ödeme tahsisi, teslim ve iptalleri gösterir. Dönem başı/sonu ürün yükümlülükleri ürün/birim bazındadır. Parasal ve ürün hareketleri ayrı sayfalanır; CSV her iki dökümü ve ayrılmış tutarı kapsar. Sipariş faaliyetleri müşteri kaydına götürür; ilgili siparişin numarası ve hareketleri müşteri bölümünden açılır.

Müşteri listesinde **Firma adı, Yetkili, Telefon, Kalan borç/alacak** başlıkları tıklanabilir ve klavyeyle kullanılabilir. Metin ilk seçimde A–Z, yeniden seçimde Z–A; bakiye ilk seçimde büyükten küçüğe, yeniden seçimde küçükten büyüğe gider. Ok ve `aria-sort` yönü belirtir. Türkçe sıralama SQL'de tüm kayıtlara, arama ile birlikte ve sayfalama öncesinde uygulanır; yalnız görünen 50 satır sıralanmaz. Bakiye sayısaldır: borç pozitif, müşteri alacağı negatif hesap işaretini korur; negatif alacaklar en küçük borç yönünde önce gelir. Ekranda alacak yine açık `+… TL · Müşteri alacaklı` etiketiyle gösterilir.

## Kalıcılık ve geçiş

Şema 7, değiştirilemez `preorders`, `preorder_events` ve `preorder_funding` tablolarıyla gelir. Sipariş, ödeme kaynağı, ayrılan/kullanılan/çözülen para ve teslim/iade ilişkileri foreign key/unique bağlarıyla saklanır. Stok, bağlı satış, tahsis, cari, faaliyet, gün/zaman bilgisi ve kalıcı işlem sonucu tek transaction içindedir. Doğrulanmış SQLite backup API yedeği geçişten önce alınır; geçiş sonrası stok/cari/sipariş/tahsis mutabakatı transaction içinde doğrulanır. Hata şema değişikliklerini geri alır. Önceki para kayıtları ürüne dönüştürülmez, işaretleri değişmez.

## Kurulum ve mevcut uygulamayı güncelleme

**Tek Windows x64 NSIS dosyası hem tam kurulum hem yerinde yükseltme içindir:**

`review-builds/signed/SucukCenter-1.5.0-RiaCoding-Kurulum.exe`

Ayrı delta/çevrimiçi güncelleme sistemi olmadığı için aynı dosya başka adla çoğaltılmadı. `com.sucukcenter.desktop`, SucukCenter.exe, kullanıcı kapsamı ve kurulum yolu/kısayol altyapısı korundu. Belgeler konumu işletim sisteminden alınır; işletme dosyaları, ayarlar ve yedekler kurulum klasöründen ayrıdır. Güncelleme çalışan uygulamayı zorla kapatmaz; normal kapatılmasını ister. Kurulum sonunda başlatma seçeneği vardır.

1. Mevcut uygulamadan **Ayarlar → Yedek Oluştur**; önceki kurulum dosyasını da saklayın.
2. Uygulamayı normal kapatın. Kaldırmayın, Belgeler/SucukCenter klasörünü silmeyin.
3. 1.5.0 kurulumunu mevcut konuma çalıştırın ve uygulamayı açın.
4. İlk açılış şema geçişinden önce doğrulanmış `yedekler/gecis-v6-….db` oluşturur (daha eski şemada dosya adı o sürümü içerir). Bakiyeleri ve stokları kontrol edin.

Eski sürüm şema 7'yi açmayı reddeder. Geri dönüş için **eski uygulama ile o uygulamayla uyumlu geçiş öncesi yedek birlikte gerekir**. Yalnız eski EXE kurmak veritabanını geri çevirmez. Açık veritabanını dosya kopyalayarak değiştirmeyin; uyumlu uygulamanın geri yükleme yolunu kullanın.

- Dosya boyutu: **134940016 bayt**.
- SHA256: `6712184662C10C703FE3EA1631E644C35392C02229A42DC92ACD3A6A8FB10C45`.
- Kurulum, uygulama ve çalıştırılmadan çıkarılan kaldırıcıda **CN=RiaCoding** test imzası ve DigiCert zaman damgası kontrol edildi. Windows zincir sonucu `UnknownError`: güvenilmeyen kök. Bu, ticari yayıncı güveni değildir ve SmartScreen uyarısını kaldırmaz. Özel anahtar dışa aktarılmadı/güven deposuna eklenmedi.
- Önceki imzalı 1.4.0 dosyası korundu: SHA256 `6AC5C5CCBA5E06C3210B386F1A008DDEDB2DA539F13631D1C778EEB63EE5A6E6`.

## Doğrulama — tamamlananlar

| Kontrol | Sonuç |
|---|---|
| Typecheck, ESLint, üretim derlemesi | Başarılı |
| Native SQLite veri/hata testleri | **68/68**, sıfır başarısız/atlanan |
| Yeni Electron UI | Ön sipariş/ödeme/kısmi teslim/diğer ürün/avans/mevcut tahsilat/fiziksel iade/iptal/sıralama; çevrimdışı başarılı |
| Yeni paketli Electron UI | `packaged=true`, ayrı test girişinde aynı akış, backup/restore/restart ve dar pencere; başarılı |
| Eski cari, satış ve aylık rapor UI | Başarılı |
| Tasarım regresyonu | 3 pencere × 3 uygulama ölçeği × 2 tema; başarılı |
| Marka dosyaları | SVG/PNG ve yedi ICO boyutu; başarılı |
| Diğer paketli iş akışları | Native SQLite, stok/satış/tahsilat, rapor/maliyet onayı/geri yükleme/yeniden açılış; başarılı |
| Üretim paketi | ASAR ana süreç, migration7, modüller, tüm arayüz/font/logo dosyaları güncel derlemeyle eşleşti; test girişi yok |
| NSIS ve test imzası | Başarılı; kamusal güven sınırı yukarıda |
| Gerçek 1.4 kodundan veri geçişi | Şema 6 → 7; doğrulanmış yedek; müşteri/tedarikçi bakiyesi, stok, kayıt ve ayarlar korunması, yeni ürün borcu/restart ve eski sürüm reddi başarılı |

Kabul senaryosu: stok sıfırda 100 kg × 250 TL ve 25.000 TL ödeme; kart fiyatı 300 TL olsa da anlaşma 250 TL; 40 kg teslimde stok/kalan yükümlülük 60 kg, tek kasa ve sıfır ek net borç; son 60 kg ile satış 25.000 TL. Mevcut 25.000 TL avansın kasa değiştirmeden ayrılması ve tekrar kullanılamaması; 5 kg diğer ürün borcunda para/kasa değişmemesi; farklı fiyatlı siparişlerin bağlantıları; kısmi ödeme/iade/iptal, tarihsel stok, aylık ürün devri ve tekrar anahtarları otomatik test edildi.

Ek sınırlar: sonradan alınmış ödemeden sonra ürün iadesi; teslimde kullanılmış yanlış ödeme bağını stok değiştirmeden çözme ve tahsilat iptali; birden fazla iadeden sonraki küçük kuruşlar; kaynak işlem sonucu yazımında yapay hata ve tüm bağlı kayıtların rollback'i; ürün/birim toplamları ve planlanan tarih filtreleri; 55+ müşteride sayfalar arası sıralama da doğrulandı.

**Fiziksel NSIS yükseltmesi doğrulanmadı:** ortamda Hyper-V/VirtualBox/VMware/Windows Sandbox çalıştırma aracı yok. Korunmuş 1.4.0 ASAR'ının gerçek kodu/arayüzüyle ayrı geçici Belgeler profiline test verisi yazılıp 1.5 ile açılması test edildi; bu, eski kurulum üzerine installer/registry/kısayol testi olarak sunulmaz. Gerçek işletme bilgisayarına kurulum yapılmadı. Windows 11 ve işletim sistemi DPI geçişi de bu teslimatta denenmedi.

Yerel tam çıktılar: `artifacts/preorders-data.log`, `preorders-ui.log`, `preorders-packaged-ui.log`, `preorders-upgrade.log`, `preorders-package.log`, `preorders-*-regression.log`, `preorders/signatures/results.json`. Bunlar Git dışında tutulur; yalnız sahte iş akışları kullanılır.

### Geliştirici

`npm test`, `npm run lint`, `npm run build`, `npm run test:preorders-ui`. Paketli test için `npm run build:review-test`, ardından yerel `SUCUKCENTER_PREORDERS_PACKAGED=1` ile aynı UI komutu. Bu yönlendirme üretim paketinde yoktur. `npm run test:upgrade-data` korunmuş önceki 1.4 ASAR'ını `artifacts/upgrade-baselines/1.4.0.asar` yolunda bekler; baselines Git'e eklenmez ve public CI'da varmış gibi varsayılmaz. Tam Windows build/diğer test komutları README'dedir.
