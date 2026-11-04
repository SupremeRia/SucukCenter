> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.6.1 — hata denetimi, performans ve temizlik

02.11.2026 · Önceki sürüm 1.6.0 / şema 8; yeni sürüm 1.6.1 / şema 9. Gerçek işletme verisi açılmadı veya test için kopyalanmadı. Gerçek kuruluma kendiliğinden yükleme/geçiş yapılmadı.

## Başlangıç ve aşamalar

Başlangıçta lint, 76/76 mevcut veri testi, typecheck ve üretim derlemesi başarılıydı. Önceden başarısız bir veri testi bulunmadı. Önce 1.6.0 ASAR kodu ve kaynak karşılaştırması saklandı; sonra aşağıdaki hatalar gerçek Electron ile üretildi. Veri/form doğruluğu, arayüz, ölçülmüş darboğazlar, temizlik ve son paket doğrulaması sırasıyla uygulandı. Geliştirme sırasında yeni kontrollerin yakaladığı sorunlar giderildi; aşağıdaki başarılar yalnız tamamlanmış son çalıştırmalardır.

## Doğrulanıp giderilen hatalar

| Hata ve etkisi | Önceki sürümde kanıt | Kök neden / çözüm |
|---|---|---|
| Ön sipariş düzeltmesinde yanlış ürün seçimi; yanlış ürünle yeni belge oluşabilirdi | 65. ürünün kaydı açıldı; seçili ürün 1 geldi | Form bağlamı yalnız ilk 50 ürünü ve satış/alış kalemlerini yüklüyordu. Ön siparişin doğrudan productId alanı atlanıyordu. İlgili belge/sipariş ürünleri sınırlı bağlam sorgusuna eklendi; eksik ürünler yüklenmeden form açılmıyor. Gerçek arayüzde miktar düzeltmesi kaydedildi ve ürün 65 olarak kaldı. Yükleme hatasında yanlış varsayılanla form açılmadığı test edildi. |
| Sayfa değişiminde önceki ekranın satır/sayfalama anlık görüntüsü görünüyordu | Satış sorgusu 900 ms geciktirilince önceki sayfanın bağlamından 10 satır + başlık görünüyordu | Son yüklenen sayfa ayrı izleniyor. Farklı sayfanın verisi gösterilmiyor; aynı sayfada arama yüklenirken input korunuyor. Regresyonda geçiş sırasında eski satır sayısı 0. |
| Gecikmeli kayıt sonrası eski sayfaya ait yenileme | Tema kaydı geciktirilip Müşteriler'e geçildi: son sorgu yeniden home idi | Kaydet/bakım geri çağrısı açıldığı andaki reload fonksiyonunu tutuyordu. Son tamamlanmada güncel ekranın yenilemesi kullanılıyor; sonuç customers → customers. |
| Her aramada ve görünmeyen raporda gereksiz hesaplama | Büyük veride 20 arama sorgusuna 20 dönem raporu; finans açılışında gizli yıllık hesap | Rapor etkileri her snapshot nesnesine bağlıydı. Kayıt değişikliği sayacı ve ilgili ekran/dönem bağımlılıkları kullanıldı. Yıllık rapor yalnız sekmesi açıldığında hesaplanıyor. Arama yazısı anında, sorgusu 150 ms gecikmeyle güncelleniyor; sayfa değişiminde eski arama taşınmıyor. |
| Uzun hesap/yedek/geri yüklemede ana süreç duraklaması | Büyük veride ana süreç 20 ms zamanlayıcısının en uzun aralığı 16.720 ms | Veritabanı işlerini tek bağlantı ve sıralı kuyrukla ayrı worker thread yürütüyor. Ana pencerenin en uzun ölçülen aralığı 36 ms. Uzun ilk hazırlıkta bekleme ekranı gösteriliyor. |

Arama odağının yeniden kaybolması, seçim listesinin kendiliğinden kapanması veya temel hesap akışlarında yeni bir bozulma doğrulanmadı; bunların mevcut regresyonları tekrar çalıştırıldı. Seçili tedarikçinin sayfa geçişine sızması ilk inceleme adayıydı; normal kullanıcı yolunda modal gezinmeyi engellediğinden yeniden üretilemedi. Gezinme bağlamı yine de açıkça sıfırlanıyor; bu aday doğrulanmış hata gibi sunulmuyor. Yerel SelectField yardımcı bileşeninin required parametresini yok sayması da sözleşmesine uygun hale getirildi; mevcut isteğe bağlı seçim yolu aramalı olduğundan bu, canlı akışta yeniden üretilmiş hata olarak sayılmadı.

## Veri, kalıcılık ve güvenlik

Para kuruş, miktar binde birim ve maliyet hesapları korunur. Satış/stok/cari/kasa/ödeme tahsisi/teslimat ve düzeltme bağlantıları mevcut transaction içinde kalır. Worker kuyruğu yalnız tek bağlantıda, aralarında backup/restore da olacak biçimde işleri sırayla yürütür. Kayıp yanıtta otomatik finansal tekrar yapılmaz; mevcut kalıcı işlem anahtarı koruması sürer. Güvenli kapatma önce kabul edilmiş işleri bitirir, sonra checkpoint ve bağlantı kapatmasını tamamlar. Yeni komutlar kapanış sırasında reddedilir.

Özet önbelleği bağlantıya özeldir. SQLite total_changes ve data_version ile kendi/dış bağlantı yazılarında geçersiz olur. Dış transaction içinde görüntü okunursa önbelleğe alınmaz; geri alınmış ara durum dışarı sızmaz. Geri yükleme yeni bağlantı oluşturduğu için eski önbellek kullanılmaz. Düzeltme, iptal, dış bağlantı yazısı, rollback ve restore ayrı testlerle doğrulandı.

Şema 9 yalnız operations sonuç/tarih, ödeme tahsisi ve düzeltme yeni kayıt bağlantıları için indeks ekler. Eski migration'lar korunur; geçişten önce doğrulanmış SQLite backup alınır. Kronolojik maliyetin sonraki hareket kontrolü mevcut tarih indeksinden başlayacak şekilde düzenlendi. Normal satış/alışta tüm ürün geçmişinin her kez taranması kaldırıldı; geçmiş işlemde aynı tam kronolojik denetim devam eder. Foreign key, WAL, FULL kalıcılık, immutable geçmiş, stok ve tutar sınırları azaltılmadı.

Renderer'ın dosya sistemi/SQL erişimi yok. contextIsolation, sandbox, kapalı nodeIntegration, güvenilir ana-frame IPC kontrolü ve CSP korunur. Worker arayüzü renderer'a açılmaz. Bakım sırasında yazma/ikinci bakım engellenir; salt okunur istekler aynı güvenli kuyruğa alınır. Gecikmeli bakım sonrasında güncel ekran yenilenir.

## Ölçüm ortamı ve veri

Windows 10.0.19045 x64; AMD Ryzen 5 5600 6-Core Processor; 12 mantıksal işlemci; 31.9 GiB RAM; Electron 45.1.0, gömülü Node 24.22.1. Veritabanları yerel geçici klasörlerdeydi; Belgeler'deki işletme veritabanı kullanılmadı. Aynı kapalı sentetik SQLite dosyaları ayrı geçici kopyalarla iki sürüme verildi. Eski kod gerçek 1.6.0 ASAR'dan çıkarıldı. Ölçümler aynı bilgisayarda sırayla çalıştırıldı.

| Başlangıç kaydı | Az | Orta | Yüksek |
|---|---:|---:|---:|
| Müşteri | 50 | 500 | 2000 |
| Ürün | 20 | 100 | 300 |
| Tedarikçi | 1 | 1 | 1 |
| Satış | 230 | 5120 | 50520 |
| Satış kalemi | 230 | 5120 | 50520 |
| Alış | 2 | 2 | 2 |
| Tahsilat | 10 | 100 | 500 |
| Ön sipariş | 10 | 100 | 500 |
| Sipariş hareketi | 20 | 200 | 1000 |
| İşlem anahtarı | 252 | 5322 | 51522 |

Hareketlerin çoğu tek yoğun üründe toplandı; uzun ürün geçmişi/maliyet yükü özellikle sınandı. 65 farklı ürünlü alış ayrıca işlevsel testtedir. Bu veri dağılımı her işletmenin veri dağılımını temsil etmez.

### SQLite işlevleri — medyan ms, önce → sonra

Okuma/yazma işlevleri beş kez, geçmiş önizleme üç kez ölçüldü. Geçmiş commit, güvenli backup ve restore tek uzun örnektir; bunlara istatistiksel p95 iddiası yoktur. Bu süreler React formu, IPC ve ekran yenilemesini içermez. İlk şema geçişi ayrı tutulur.

| İşlev | Az | Orta | Yüksek |
|---|---:|---:|---:|
| Ana ekran sorgusu | 7,6 → 7,0 | 23,9 → 20,3 | 167,4 → 103,6 |
| Son satış sayfası | 10,8 → 12,6 | 46,3 → 41,5 | 370,1 → 301,4 |
| Müşteri arama sorgusu | 6,4 → 6,6 | 20,4 → 15,7 | 141,3 → 71,5 |
| Ürün arama sorgusu | 5,2 → 6,6 | 23,3 → 18,0 | 152,9 → 80,3 |
| Düzenlenecek kaydın hazırlanması | 0,5 → 0,3 | 0,8 → 0,3 | 21,3 → 0,5 |
| Alış transaction | 2,2 → 2,4 | 5,8 → 2,1 | 40,7 → 2,4 |
| Satış transaction | 2,0 → 2,1 | 4,8 → 1,9 | 38,7 → 1,9 |
| Tahsilat transaction | 1,6 → 1,6 | 1,7 → 1,6 | 1,9 → 1,7 |
| Aylık rapor | 2,7 → 3,8 | 31,6 → 27,4 | 327,4 → 310,6 |
| Müşteri ekstresi | 2,3 → 1,8 | 2,3 → 2,2 | 3,5 → 3,1 |
| Geçmiş işlem önizleme | 8,1 → 6,8 | 105,1 → 115,8 | 1.139,4 → 1.036,5 |
| Geçmiş işlem commit | 7,0 → 8,0 | 111,1 → 103,5 | 1.130,6 → 1.064,5 |
| Doğrulanmış yedek | 71,7 → 67,5 | 967,3 → 985,3 | 8.942,6 → 9.283,8 |
| Doğrulanmış geri yükleme | 182,9 → 176,8 | 2.539,6 → 2.804,6 | 24.771,6 → 25.618,1 |

### Gerçek Electron — gözlenen ms, önce → sonra

Her hacimde aynı adımlar bir tur çalıştırıldı. Normal açılış ikinci açılışta, şema geçişi olmadan ölçüldü. Bu üç hacimli karşılaştırmada otomatik yedek kapalıydı. Arama süresi klavye yazımını ve sonuçların yerleşmesini de kapsar. Form/seçim açma, tıklama ve animasyonları içerir. Zamanlayıcı aralığı ana sürecin yanıt verebilirliğini ölçer; ekran kare hızı veya fiziksel fareyle pencere sürükleme ölçümü değildir.

| Akış | Az | Orta | Yüksek |
|---|---:|---:|---:|
| Normal açılış / ilk kullanılabilir ekran | 700,0 → 779,0 | 683,0 → 827,0 | 934,0 → 1.032,0 |
| Müşteriler sayfasına geçiş | 446,0 → 203,0 | 344,0 → 189,0 | 652,0 → 136,0 |
| Yazımdan arama sonucuna | 1.347,0 → 930,0 | 1.671,0 → 920,0 | 7.484,0 → 932,0 |
| Yeni müşteri formu | 369,0 → 392,0 | 385,0 → 384,0 | 378,0 → 365,0 |
| Satış formu + müşteri listesi | 222,0 → 241,0 | 241,0 → 226,0 | 222,0 → 225,0 |
| Finans sayfasına geçiş | 87,0 → 54,0 | 345,0 → 59,0 | 3.021,0 → 305,0 |
| IPC üzerinden güvenli yedek | 81,0 → 77,0 | 891,0 → 853,0 | 8.606,0 → 7.645,0 |
| IPC üzerinden geri yükleme | 235,0 → 237,0 | 3.452,0 → 3.446,0 | 32.111,0 → 32.443,0 |
| Uzun bakımda en büyük ana süreç aralığı | 114,0 → 34,0 | 1.762,0 → 36,0 | 16.720,0 → 36,0 |

| Aramadaki istek | Az | Orta | Yüksek |
|---|---:|---:|---:|
| snapshot | 20 → 1 | 20 → 1 | 20 → 1 |
| report | 19 → 0 | 18 → 0 | 20 → 0 |
| annual | 0 → 0 | 0 → 0 | 0 → 0 |

Hızlanmayan alanlar açıkça korunuyor: normal açılışta 934 → 1032 ms ile yaklaşık 0,1 sn ek maliyet var. Küçük veri/form/seçim sürelerindeki birkaç-on ms fark için hızlanma iddiası yok. Güvenli backup/restore toplam süresi anlamlı biçimde kısalmadı; doğrulamaları azaltmak yerine ana süreçten ayrıldı. Büyük veride ilk 8→9 geçişi, yedek ve mutabakat dahil yaklaşık 25.9 sn sürdü; pencere yaklaşık 391 ms'de oluşturuldu ve uzun hazırlık için bekleme ekranı var. Bu bir kezlik geçiş normal açılışla karıştırılmamalıdır.

Ayrı mevcut test: 50.000 satış / 1.000 müşteriyle normal açılış 1.164 ms, doğrulanmış otomatik yedek içeren açılış 9.110 ms ölçüldü. Bu farklı veri seti üç hacimli tabloyla doğrudan karşılaştırılmadı; güvenli otomatik yedeğin ilk günlük açılış maliyeti korunur.

### Yerel kanıtlar

Önce/sonra ham örnekler: artifacts/audit/*-comparison.json ve *-runtime.json. Fixture dosyaları artifacts/audit/*-after-measurement.db adlarında, yalnız sentetik veridir ve Git'e alınmaz. Yerel tekrar için bu fixture'lar ve artifacts/audit/legacy-1.6.0 altındaki eski ASAR kodu gerekir. Güncel arayüz regresyonları bunlardan bağımsızdır; test:audit-ui kendi geçici verisini oluşturur.

| Aynı karşılaştırma girdisi | SHA256 |
|---|---|
| Az | 9A192595E6862BA3C9B8D512451B893B2EECA0362071241AE12CFB950E63FF82 |
| Orta | 472ADE3C661B4E13BAE04C03D220A44F36B85FA795B36E4629EDD29460185A6F |
| Yüksek | FD7240F5AAFBA211D754EF022B6FE6C01A982C9AE43D6ECA9526253D1C1AAD80 |

## Güvenli temizlik

Kaynak kullanımı ve import/dinamik yollar incelendikten sonra 13 kullanılmayan UI yardımcısı kaldırıldı: AlertDialogTrigger, AlertDialogMedia, AlertDialogAction; CardHeader, CardTitle, CardDescription, CardAction, CardFooter; DialogTrigger, DialogClose, DialogFooter; TableFooter, TableCaption. Yalnız tanım/export olarak bulunuyorlardı. Kullanılan overlay/portal/başlık/içerik ve düğmeler korundu.

Sağ tık ve üç noktanın tekrarlanan menü öğeleri tek RecordMenuItems bileşeninde toplandı; erişim seçenekleri, kayda bağlılık, klavye ve odak davranışı korundu. Kullanılmayan Button importu da kaldırıldı. Temizlik öncesi kopyalar ve yalnız temizlik farkı artifacts/audit/cleanup-before ve cleanup.patch içinde ayrı incelenebilir.

Migration, eski veri kurtarma, güvenli kapatma, otomatik/elle backup, geri yükleme ve mevcut testler kaldırılmadı. Bağımlılıklar topluca yükseltilmedi; kullanılan bağımlılıklar korundu. Dinamik stiller için yeterli kanıt olmayan silmeler yapılmadı. Çalışma zamanında zaten tree-shake edilen yardımcılar için büyük hız kazancı iddiası yok.

## Son doğrulama

- Başlangıç: 76/76 veri testi; mevcut typecheck/lint/build başarılı.
- Son: **79/79 veri testi**, typecheck, lint ve üretim derlemesi başarılı. Yeni testler işçi kuyruğu/idempotency/rollback/kapanış/yeniden açılış/backup/restore; önbellek geçersizliği ve transaction rollback izolasyonu; ilk sayfa dışı ürün ve 65 kalemli belge bağlamını kapsar.
- test:ui, test:monthly-ui, test:accounts-ui, test:preorders-ui, test:records-ui, test:choices-ui, test:design-ui, test:brand, test:performance başarılı. Mevcut testler test süresini azaltmak için kaldırılmadı.
- test:audit-ui: 65. ürünle gerçek düzeltme kaydı, yükleme hatasında yanlış formu engelleme, gereksiz rapor olmaması, isteğe bağlı yıllık rapor, eski sayfa verisinin gösterilmemesi, gecikmeli kayıttan sonra güncel sayfa yenilemesi ve bakımda güvenli okuma başarılı. Son iki hatanın 1.6.0 öncesi kanıt logları da saklandı.
- Gerçek Electron: 3 pencere boyutu ×3 ölçek ×2 tema; arama odağı/imleç/klavye, takvim ve tarih hataları, uzun firma adları, çok kalemli form, korumalı taslak, boş liste, rapor ve yatay kaydırma kontrolleri başarılı.
- Paketlenmiş inceleme uygulamasında yeni audit akışı %100 ve %150; tam kayıt/arama/menü/düzeltme/arşiv testleri %100/%125/%150 başarılı. Testler çevrimdışı. Chromium/Electron ölçek faktörü Windows üzerinde değiştirildi; işletim sisteminin tüm masaüstü DPI ayarı değiştirilmedi.
- Paketlenmiş review-runtime: gerçek better-sqlite3, satış/tahsilat, kapat/aç, güvenli backup/restore, onay/vazgeç, bozuk yedek, geri dönüş yedeği, aylık/yıllık rapor ve geçmiş maliyet onay/red/kalıcılık başarılı.
- Paket içeriği karşılaştırması: güncel worker/service, migration ve derlenmiş arayüz varlıklarıyla eşleşiyor; üretim paketinde test Documents yönlendirmesi yok. Eski test yalnız main.js içinde openMigrating metnini arıyordu; yeni mimaride migration çağrısını worker'da ve servisi main'de denetleyecek şekilde güncellendi.
- **Gerçek 1.6.0 ASAR → 1.6.1**: sahte müşteri/tedarikçi/ürün, alış/satış/tahsilat, ayrılmış ödeme ve kısmi teslimat, kalan ürün borcu ve ayarlar korundu. Şema 8 geçiş yedeği doğrulandı; geçiş sonrası düzeltme ve yeniden açılış kontrol edildi. Eski kod şema 9'u reddetti.

## Tam kurulum / yerinde yükseltme

Tek dosya iki kullanım içindir: **SucukCenter-1.6.1-RiaCoding-Kurulum.exe**. Dosya yolu: review-builds/signed/SucukCenter-1.6.1-RiaCoding-Kurulum.exe.

Yeni bilgisayarda tam kurulum yapar; mevcut kullanıcı hesabında aynı uygulamanın kurulumunu kaldırmadan yerinde yükseltmek için de hazırlanmıştır. Ayrı bir delta güncelleme servisi değildir.

1. Mevcut uygulamada Ayarlar → Yedek Oluştur ile isteğe bağlı ek bir yedek alın.
2. SucukCenter'ı normal biçimde kapatın.
3. EXE'yi mevcut kurulumun kullanıcı hesabında çalıştırın; mevcut kurulum klasörünü kullanın. Önceki sürümü kaldırmanız gerekmez.
4. Veriler işletim sisteminin döndürdüğü Belgeler/SucukCenter konumunda kalır. İlk geçiş doğrulanmış şema yedeği oluşturur; büyük veride hazırlığın tamamlanmasını bekleyin.

Boyut: **134954472 bayt**. SHA256: **7E08388BB69A588137B256A8899D1533A86BC2D69F68E8E7AC02E87BC69B3476**.

İmzalayan: **CN=RiaCoding**; DigiCert SHA256 zaman damgası doğrulandı. Bu, kullanıcı onaylı yerel test sertifikasıdır. Windows durumu UnknownError: sertifika kökü güvenilir değildir. Ticari yayıncı güveni/SmartScreen uyarısının kalktığı iddia edilmez.

**Doğrulanmayanlar:** fiziksel NSIS kurulum/yükseltme sihirbazı, kayıt defteri/kısayollar, Windows 11 ve gerçek işletme verisiyle çalışma. Doğrulanan önceki sürüm yükseltmesi eski/yeni uygulama koduyla gerçek izole runtime/veritabanı geçişidir; fiziksel kurulum testi gibi sunulmaz. Gerçek işletme verisine otomatik kurulum yapılmadı.
