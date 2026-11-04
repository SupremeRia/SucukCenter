> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.7.0 — Giderler

04.11.2026 · Şema 10 · Windows x64 · Gerçek işletme verisine erişilmeden geliştirilmiştir.

## Kullanım

Sol menüde **Giderler → Gider ekle**. Serbest gider adı, pozitif TL tutarı, işlem tarihi, isteğe bağlı açıklama ve Nakit/Banka/Kart ödeme yöntemi girilir. Bu, gerçekleşmiş ve ödenmiş harcamadır; borçlu fatura veya tekrarlayan otomatik ödeme oluşturmaz. Gider adı önceden tanımlanmış bir türle sınırlanmaz.

Ortak dönem seçici ay, tek gün ve tarih aralığını destekler. Ad araması Türkçe büyük/küçük harfe duyarsızdır, yazı anında güncellenir; sorgu 150 ms geciktirilir. Liste işlem tarihi ve kimlik azalan sıradadır, sorgu başına 50 hareket ve ortak sayfalama kullanır. İptal/iade ters hareketleri negatif gider tutarıyla görünür. “Seçili dönem gideri” hem tarih hem ad filtresini uygular; “Tüm zamanlar net gideri” hiçbirini uygulamaz. Farklı dönemde alınan iade, özgün gider o ayda bulunmasa bile kendi tarihinde listelenir.

Sağ tık, üç nokta veya Shift+F10 menüsünden görüntüleme/düzeltme/iptal yapılır. **Gider iadesi al** ayrıca sunulur:

- **Düzelt:** Özgün form değerleri yüklenir; gerekçe ve etki karşılaştırması/onay istenir. Eski gider özgün tarihte ters çevrilir; düzeltilmiş gider seçilen tarihte oluşturulur. Özgün kayıt, eski/yeni değerler ve bağlantılar değişmez kalır.
- **İptal et:** Gerçekte gerçekleşmeyen yanlış giderin gider ve ödeme etkisi özgün işlem döneminde ters çevrilir. İptalin programa giriş zamanı ayrıca gerçek zamanıyla korunur. Bu akış başka gider türlerinin mevcut iptal kurallarını değiştirmez.
- **Gider iadesi al:** Gerçekten geri alınan **tam ödeme** kendi iade tarihinde bağlantılı giriş ve negatif gider oluşturur. İade tarihi özgün giderden önce olamaz. İlk sürümde kısmi gider iadesi yoktur. İade tutarı ve ödeme yöntemi özgün giderden gelir; eski kayıtta yöntem bilinmiyorsa bilinmiyor olarak kalır.

İptal, düzeltme veya iade sonrası aynı kayda ikinci ters etki uygulanamaz. Güncel düzeltilmiş kayıt üzerinden devam edilir. Finansal kayıt kalıcı silinmez. Hata halinde form taslağı korunur; kapatırken değişiklik uyarısı gösterilir.

## Veri ve hesap kuralları

Yeni, bağımsız bir gider defteri oluşturulmadı. Mevcut **cash_transactions** gider/ödeme kaydı tek parasal kaynaktır. Yeni **expense_details** tablosu yalnız aynı kasa kaydının ad/açıklama/yöntem bilgilerini tutar ve foreign key ile bağlıdır; ikinci bir tutar bakiyesi içermez. Eski kasa, aktivite, işlem anahtarı ve rapor akışları kullanılır.

Tüm gider ekleme/düzeltme/iptal/iade etkileri mevcut transaction ve worker kuyruğundadır. Kasa, detay, tarih, aktivite, düzeltme bağlantısı ve işlem anahtarı birlikte kaydedilir veya birlikte geri alınır. Aynı UUID ve aynı içerik tekrar gönderilirse kayıtlı sonuç döner; farklı içerikle aynı anahtar reddedilir. Arayüzde ayrıca eşzamanlı gönderim kilidi vardır. Stok ve müşteri cari hareketi oluşturulmaz.

Tutarlar tam sayı kuruştur. İşlem tarihi event_meta/event_days içinde, gerçek programa giriş zamanı değişmez created_at/recorded_at alanlarında korunur. Örneğin Kasımda girilen 15 Ekim kirası Ekim gideridir.

Ortak **shared/profit.ts** hesabı:

- Brüt satış kârı = net satış − satılan ürünlerin maliyeti.
- Net işletme sonucu = brüt kâr − işletme giderleri − fire − diğer ürün borcu teslim maliyeti + tedarikçi iade maliyet farkı.
- Net marj = net işletme sonucu / net satış × 100. Net satış sıfır veya negatifse **Hesaplanamıyor**.

Diğer ürün borcu teslim maliyeti ve tedarikçi iade farkı mevcut kurallardır; burada ikinci kez düşülmez. Tahsilat kâr değildir; mal alışı ayrıca işletme gideri sayılmaz. Dashboard, aylık özet, yıllık karşılaştırma ve finans açıklaması aynı fonksiyonu kullanır. Pozitif sonuç **Net kâr / +₺…**, negatif sonuç **Net zarar / -₺…** şeklinde metin ve işaretle açıklanır. Yıllık tabloda her ayın gideri ve net sonucu ayrıca görünür.

Yeni filtreye geçiş, yükleme ve hata sırasında eski dönem toplamı görünmez. Arama kutusu yüklenen tablo dışında kaldığından yeniden sorgulama yazma odağını kaldırmaz. Gecikmiş sorgu sonuçları yeni ekranı ezmez.

## Güvenli yükseltme

Şema 9 → 10 geçişinden önce mevcut güvenli SQLite backup yöntemiyle **gecis-v9-UUID.db** oluşturulur, bütünlük/foreign key/hesap mutabakatı doğrulanır. Geçiş ve son mutabakat transaction içindedir; hata halinde şema değişiklikleri geri alınır. Yeni tablo geçmiş giderlerin eski açıklamasını değiştirmeden hem ad hem açıklama olarak taşır. Bilinmeyen ödeme yöntemi NULL kalır; arayüzde **Bilinmiyor (eski kayıt)** görünür. Eski giderin düzeltme formunda kullanıcı yöntem seçene kadar herhangi bir yöntem varsayılmaz.

Eski migration’lar, kurtarma kodları, WAL/checkpoint, doğrulanmış yedek, geri dönüş yedeği, kayıt anahtarları ve paket güvenliği korunmuştur. Çalışan veritabanı dosyası doğrudan kopyalanarak yedeklenmez. Veriler projede değil işletim sisteminin Belgeler/SucukCenter konumundadır. Gerçek veriye kendiliğinden kurulum veya geçiş yapılmadı.

## Kabul kanıtları

| Senaryo | Doğrulanan sonuç |
|---|---|
| 50.000 TL net satış, 30.000 TL maliyet | Brüt kâr 20.000 TL |
| Kira 8.000 + elektrik 1.500 + su 500 + mazot 2.000 | Gider 12.000; net kâr 8.000; marj %16 |
| Ek 10.000 TL tamir | Gider 22.000; net zarar −2.000; marj −%4 |
| 2.000 → 1.500 TL gider düzeltmesi | Gider −500; net sonuç +500; yalnız doğru net kasa etkisi |
| Gider, çift gönderim, hata | Stok/cari değişmez; tek ödeme; hata halinde yarım kayıt yok |
| Ekim gideri, Kasımda gerçek iade | Ekim gideri korunur; Kasım gideri negatif; aylık/yıllık/listelenen hareketler eşleşir |
| Satışsız ay / negatif net satış | Tutar korunur; marj Hesaplanamıyor |
| İptal/tekrar iade/eski düzeltme | Tekrar ters kayıt reddedilir |
| Kapat/aç, doğrulanmış yedek ve geri dönüş | Toplamlar ve detaylar korunur |

Yeni veri testleri, gelişigüzel örnek ekran yerine gerçek Electron/IPC/SQLite akışı, kasıtlı gecikmiş sorgu ve rapor hatası içerir. Geliştirme sırasında yeni iade kaydının yedek kontrolünde, açık SQLite iterator içinden tekrarlanan PRAGMA çağrısı bağlantıyı meşgul gösterdi. Şema desteği iterator öncesinde bir kez okunarak düzeltildi; iade içeren backup/restore regresyonu eklendi. Mevcut temel UI testi yeni zorunlu “Giderin adı” alanını dolduracak şekilde güncellendi; davranış testleri kaldırılmadı.

## Doğrulama ve sınırlar

- Başlangıç lint/typecheck ve 79/79 mevcut veri testi geçti.
- Son lint/typecheck ve üretim derlemesi geçti. 83/83 veri testi başarılı; atlanan veya başarısız test yok (son gözlenen koşu yaklaşık 7,06 saniye).
- Kaynak Electron: temel satış/tahsilat/iptal/yedek, aylık rapor, cari hesap, ön sipariş, arama/menü/kayıt, seçim listeleri, denetim regresyonu, marka ve tasarım kontrolleri geçti.
- Tasarım: 3 pencere boyutu × 3 Electron ölçeği × 2 tema = 18 kombinasyon; takvim, odak, taslak koruma, koşullu alanlar ve çok kalemli form kontrolleri geçti.
- Yeni gider UI testi: dört temel gideri formla oluşturma, net kâr ve marj, ek giderle zarar, sağ tık düzeltme, özgün dönemde iptal, Kasımda gerçek iade, yıllık özet, satışsız ayda marj, kasıtlı gecikmiş sorgular ve rapor hatası, kesintisiz yazma, hatadan sonra taslak, yeni formda boş değer, çift gönderim, üç boyut, güvenli yedek/geri dönüş/kapat-aç geçti.
- Aynı gider testi paketli Electron üzerinde %150 ölçekte ve üç pencere boyutunda geçti. Ayrı paketli genel runtime testi de gerçek Electron/better-sqlite3, geçmiş maliyet, backup/restore ve çevrimdışı akışları doğruladı.
- Gerçek eski 1.6.1 ASAR → 1.7.0 şema 10 yükseltmesi geçti; eski aktif/iptal giderler ve diğer işletme kayıtları korundu, doğrulanmış geçiş yedeği oluştu.
- Üretim ASAR dosyaları güncel derlemeyle karşılaştırıldı; yeni gider/ortak hesap dosyaları içeride, test Documents yönlendirmesi dışarıda.
- Üretim derlemesindeki mevcut formlar için “static + dynamic import” uyarısı derlemeyi engellemedi; bağımlılık toplu yükseltmesi yapılmadı.

Yerel kanıtlar: artifacts/expenses-final-tests.log, expenses-final-lint.log, expenses-final-typecheck.log, expenses-final-ui.log, expenses-packaged-ui-150.log, expenses-final-test-*.log, expenses-review-runtime.log, expenses-package-test.log, expenses-signed-build.log ve expenses-signature.json. Kanıtlar ve sentetik DB dosyaları GitHub dışında tutulur. Gider ekranı örneği artifacts/expenses/final-packaged-1.5.png dosyasındadır.

Ortam: Windows 10.0.19045 x64; geliştirme Node 24.18.0, npm 11.16.0; Electron 45.1.0 ve better-sqlite3 13.0.3. Tüm kayıtlar sentetiktir; her UI testi ayrı geçici Documents/profil kullanır. İşletme veritabanına örnek eklenmez.

## Kurulum / yerinde güncelleme

[SucukCenter-1.7.0-RiaCoding-Kurulum.exe](../review-builds/signed/SucukCenter-1.7.0-RiaCoding-Kurulum.exe)

- Boyut: 134955336 bayt.
- SHA256: **14D82069A5471B818B01F7DC389C73CD20508B1D48758327DD80A95AED11C3F7**.
- İmzalayan: CN=RiaCoding; SHA256 ve DigiCert RFC3161 zaman damgası görüldü.
- Authenticode: UnknownError; zincir yerel ve güvenilmeyen kökte bittiği için güvenilen ticari sertifika doğrulaması sayılmaz.

Aynı NSIS EXE hem tam kurulum hem mevcut kurulumu kaldırmadan yükseltme paketidir; ayrıca delta/otomatik güncelleme paketi yoktur. Uygulamayı normal biçimde kapatın, EXE’yi çalıştırın, mevcut kurulum konumunu kullanın. Önce kaldırma yapmayın. appId ve veri konumu korunur; ilk açılış şema geçişinden önce doğrulanmış yedek oluşturur. Başlat menüsü/masaüstü kısayolu yapılandırması korunur.

Gerçek 1.6.1 paketinin kaynakları izole Electron sürecinde çalıştırılıp eski kayıtlar oluşturuldu; yeni sürüm aynı geçici Documents ile açıldı. Aktif/iptal gider, özgün açıklama, bilinmeyen yöntem, stok, müşteri bakiyesi, finansal özet, ayarlar ve ödemesi bağlı kısmi teslim siparişi korundu. Eski giderin yeni formda doğru adla ve boş yöntem seçimiyle açılması kontrol edildi. Güncel düzeltme ve yeniden başlatma doğrulandı. Eski kod yeni şemayı güvenle reddetti.

Bu **gerçek eski/yeni kodla veri yükseltme testidir**. Fiziksel NSIS sihirbazı, kurulu Windows programı üzerinde dosya değiştirme/registry/kısayol testi, Windows 11 ve sistem genelindeki Windows DPI değişimleri ayrıca doğrulanmadı. RiaCoding imzası kullanıcının daha önce onayladığı yerel test sertifikasıdır; kamuya güvenilen yayıncı veya SmartScreen uyarısının kalkması anlamına gelmez.
