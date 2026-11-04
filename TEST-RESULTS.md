# Güncel doğrulama — 05.11.2026 / 1.8.0-rc.1

Bu sürüm **ön sürümdür**. Gerçek işletme verisi açılmadı veya değiştirilmedi; gerçek kuruluma kendiliğinden güncelleme uygulanmadı. Aşağıdaki sonuçlar geçici klasörlerde sentetik verilerle alındı. Önceki sürümlerin sonuçları bu sürümün kanıtı sayılmadı.

## Ortam ve tamamlanan kontroller

Windows 10 x64 10.0.19045, Node 24.18.0, npm 11.16.0; Electron 45.1.0 / gömülü Node 24.22.1, better-sqlite3 13.0.3 kullanıldı. Lint, iki TypeScript kontrolü, üretim derlemesi ve **86/86 yerel SQLite veri testi** geçti.

- Temel satış/stok/cari, tahsilat/avans, aylık rapor, ön sipariş/kısmi teslimat, gider, düzeltme/iptal/arşivleme, arama/seçim ve yenileme Electron testleri geçti. Paketli test runtime'ında finans, geçmiş tarihli maliyet, yedekleme/geri yükleme, iptal ve bozuk yedeğin reddi doğrulandı.
- 20 temada tablo, form, takvim, sağ tık ve aramalı seçim kontrol edildi. Kaynak uygulama %100; paketli uygulama %125 ve %150 Electron ölçeğinde test edildi. Tema önizleme/uygula/vazgeç, sistem seçimi, kapat/aç, açık taslak/arama odağı ve seçili tarih korundu. Üç pencere boyutunda galeri sınırları; mevcut tasarım testinde 3 boyut × 3 ölçek × 2 tema, toplam 18 kombinasyon doğrulandı. Her temanın her pencere/ölçekle tüm çapraz kombinasyonları test edilmedi.
- Normal/ikincil/vurgu metni ve anlamsal renklerin türetilmiş yüzeylerde en az 4.5:1 kontrastı otomatik kontrol edildi. Yer tutucu solukluğu ve vurgu düğmesinin hover karartması kaldırılarak hesaplanan renkler korundu.
- Verilen ICO okunarak **16, 24, 32, 48, 64, 128, 256** boyutlarında yedi 32-bit alfa çerçevesi doğrulandı. Uygulama, kurulum ve imzalı kaldırıcı EXE içindeki PE ikon kaynakları kanonik ICO ile eşleşti. Bu, fiziksel kurulu kısayol/Windows ikon önbelleği testi değildir.
- Üretim ASAR'ı güncel derleme ile karşılaştırıldı; test girişleri ve eski marka dosyaları üretim paketinde yok. Font ve ikonlar yerel paket içinde.
- Gerçek 1.7.0 app.asar koduyla sentetik şema 10 kayıtları oluşturulup şema 11'e taşındı. Stok, müşteri bakiyesi, giderler, tahsisli/kısmi teslim edilmiş ön sipariş, ürün borcu ve ayarlar korundu; kapat/aç ve eski kodun yeni şemayı reddetmesi doğrulandı. **Bu veri geçişi testi fiziksel NSIS yerinde yükseltmesi değildir.**

## Yeniden üretilen ve düzeltilen hata

Takvim kapandıktan sonra geciken Radix odak geri yükleme işlemi, kullanıcının geçtiği ürün arama alanından odağı eski takvim düğmesine taşıyabiliyordu. Kontrollü gecikmiş kapanışla hata yeniden üretildi: önce arama boş ve odak takvimdeydi. Kapanış artık yeni odaklanmış alanı koruyor; yalnız odak kaybolmuşsa veya eski takvimdeyse tetikleyiciye dönüyor. Aynı regresyon testinde artık `Odak` metni kesintisiz yazılıyor ve ürün seçiliyor; kaynak ve paketli Electron'da geçti. Belirtiyi gizlemek için yeniden odaklama döngüsü eklenmedi.

Bu sürümde finansal hesaplama algoritmaları yeniden yazılmadı. Yeni mali hata bulunduğu iddia edilmiyor; mevcut kurallar regresyon testleriyle korundu. Migration'lar, kurtarma/yedekleme ve transaction korumaları kaldırılmadı.

Üretim sertifikası ön kontrolünde Windows sertifika sağlayıcısına bağımlı seçenek bu ortamda hata verdi. Kontrol salt okunur .NET sertifika deposuyla değiştirildi; yerel RiaCoding sertifikası artık sağlayıcı hatası yerine güvenilir üretim sertifikası şartlarını karşılamadığı için reddediliyor. Özel anahtar dışa aktarılmadı veya güven deposu değiştirilmedi. Eski logoyu yeniden üreten, artık çağrılmayan make-icon betiği de kaldırıldı.

## Açılış ölçümleri

İlk çizim bildirimi sonrası ana pencerenin gösterilmesi normal açılışta **7.187 ms**; yapay 8,5 saniyelik UI hazırlık gecikmesinde **8.961 ms** oldu. Böylece hem 7 saniyelik alt sınır hem gerçek hazırlık bekleme kapısı test edildi. İkinci gerçek süreç mevcut küçültülmüş pencereyi geri getirdi; ikinci splash açılmadı. Bitince tek ana pencere kaldı ve hazır olma dinleyicisi kaldırıldı. Bozuk veritabanı ve eksik logo hata/çıkış yolları geçti.

Alfa ≥24/255 maskesi 600×375 çizimde 1.355 birleştirilmiş bölge oluşturdu. Birim testi harf içi boşlukları ve eşik altı pikselleri korudu. Pencerenin tamamını fareye kapatma kullanılmadı. `setShape` Electron'un **deneysel** Windows API'sidir.

**Gerçek native tıklama geçişi doğrulanamadı.** Paketli test penceresi ve ayrı alt pencere hazırlandı; ancak Windows görüntü yakalama zaman aşımına uğradı ve erişilebilirlik tıklaması `coordinate input geometry is unavailable` hatasıyla giriş göndermeden durdu. C içi/harf arası/dış boşluk/ görünür logo tıklamalarının başka pencereye geçişi başarılı sayılmıyor. DOM/maskenin doğruluğu veya video bu kontrolün yerine geçmez. OS düzeyinde farklı DPI, çoklu monitör ve Windows 11 ayrıca doğrulanmalıdır.

## Performans ve temizlik

50.000 satış / 1.000 müşteri / 59.437.056 bayt sentetik DB ile: açma 2,03 ms; ana sayfa sorgusu 200,33 ms; son satış sayfası 311,90 ms; tam dönem raporu 253,45 ms; yazma medyanı 1,77 ms, p95 7,77 ms. 50.020 hareketi etkileyen geçmiş tarih önizlemesi 985,99 ms, kaydı 1.064,82 ms. Gerçek Electron kullanılabilir pencere 8.049 ms; doğrulanmış otomatik yedekle 8.066 ms. Bunlar kasıtlı 7 saniye splash beklemesini içerir. Bu tasarım sürümü için aynı koşullarda önce/sonra hızlanma ölçümü alınmadı; hızlanma oranı iddia edilmiyor. Önceki audit karşılaştırmaları tarihsel belgelerde ayrı tutuldu.

Yeni logoların yerini alan eski S/wordmark dosyaları ve erişilmeyen eski startup kartı kaldırıldı. Test pencere seçimi ortaklaştırıldı; testler artık splash yerine görünür ana pencereyi bekliyor. Dinamik modüller, preload/IPC, veri geçişleri, finans testleri ve kurtarma yolları korundu; bağımlılıklar topluca yükseltilmedi.

## İmza, dağıtım ve açık kapılar

1.8.0-rc.1 x64 NSIS kurulum dosyası üretildi. Aynı EXE tam kurulum ve yerinde yükseltme içindir. Uygulama/kurulum/kaldırıcı CN=RiaCoding yerel test sertifikasıyla SHA-256 ve DigiCert zaman damgası taşıyor. Sertifika kendinden imzalı olduğundan Windows güven zinciri doğrulanmadı (`UnknownError`, güvenilmeyen kök); **güvenilir üretim imzası değildir**. Üretim imzalama ön kontrolünün bu test sertifikasını reddettiği test edildi. Güvenilir sertifika/hizmet erişimi bulunmadı ve satın alma yapılmadı. Kullanıcının bildirdiği diğer-PC uyarısı SmartScreen güven/itibar uyarısıdır; Defender zararlı yazılım tespiti bildirilmedi.

Fiziksel temiz NSIS kurulum/yerinde yükseltme, kurulu kısayol ikonları, Windows 11, OS DPI/çoklu monitör ve gerçek native mouse-through açık kalmaktadır. Bu nedenle **kararlı sürüm yayınlanmadı**. Yerel otomasyon sonuçları uzaktaki GitHub Actions çalışmasının başarılı olduğu anlamına gelmez; oradaki sonuç ayrıca görülmelidir.

Güncel paket özeti ve indirme: [sürüm notları](RELEASE-NOTES.md), [SHA256SUMS.txt](SHA256SUMS.txt), [GitHub Releases](https://github.com/SupremeRia/SucukCenter/releases/tag/v1.8.0-rc.1). Aşağıdaki bölümler önceki sürümlerin tarihsel kayıtlarıdır.

### Yayın sonrası GitHub doğrulaması

İlk GitHub Windows koşuları veri/lint/üretim ve temel iş akışlarını geçti; design-ui testi, sanal masaüstünde başlangıç genişliği 1.100 px altına düştüğü için geniş menüye ait düğmeyi bulamadı. Bu kontrolün başlangıç boyutu artık açıkça 1.440×940 olarak belirleniyor; dar görünümün ayrı boyut matrisi korunuyor. Düzeltme yalnız test kodundadır. Yayınlanan v1.8.0-rc.1 etiketi ve imzalı kurulum dosyası değiştirilmedi. İlk koşuların başarısızlığı gizlenmedi: [koşu](https://github.com/SupremeRia/SucukCenter/actions/runs/41916395286). Güncel ana dalın sonucu Actions sayfasında ayrıca görülebilir.

# Tarihsel doğrulama — 04.11.2026 / 1.7.0

Giderler, ortak net sonuç/marj, tarihli gider iadesi ve şema 10 geçişi tamamlandı. 83/83 veri testi, lint/typecheck/üretim derlemesi, temel/cari/aylık/ön sipariş/kayıt/seçim/denetim testleri, 18 tasarım kombinasyonu, gerçek ve paketli gider akışları, paketli runtime ve üretim ASAR karşılaştırması geçti. Gerçek 1.6.1 kodundan eski giderler dahil izole yükseltme doğrulandı. Paket, kurallar ve fiziksel kurulum sınırları: [docs/EXPENSES-1.7.md](docs/EXPENSES-1.7.md). Gerçek işletme verisiyle kurulum/geçiş yapılmadı.

# Güncel doğrulama — 02.11.2026 / 1.6.1

Başlangıçta 76/76; son sürümde 79/79 veri testi başarılı. Lint/typecheck/üretim derlemesi, tüm temel/cari/aylık/ön sipariş/seçim testleri, 18 pencere-ölçek-tema kombinasyonu, paketli %100/%125/%150 kayıt akışı, paketli runtime ve üretim ASAR karşılaştırması geçti. Gerçek eski 1.6.0 kodundan şema 9 geçişi yalnız sentetik verilerle doğrulandı. Ölçümler, hata kanıtları, temizlik ve sınırlar: [docs/AUDIT-1.6.1.md](docs/AUDIT-1.6.1.md). Fiziksel NSIS kurulum/yükseltmesi, Windows 11 ve gerçek işletme verisi doğrulanmadı.

Aşağıdakiler önceki sürümlerin tarihsel kayıtlarıdır.

# Güncel doğrulama — 01.11.2026 / 1.6.0

Typecheck/lint/üretim derlemesi, 76/76 veri testi, gerçek Electron arama/menü/düzeltme regresyonu ve mevcut temel/cari/ön sipariş/seçim akışları başarılı. 1.5.1 gerçek eski koddan şema 8 geçişi izole sahte verilerle doğrulandı. Yeni paket ve kapsam: [docs/RECORDS-1.6.md](docs/RECORDS-1.6.md). Fiziksel NSIS kurulumu/yükseltmesi ve gerçek işletme verisinde geçiş yapılmadı.

Aşağıdaki sonuçlar önceki sürümlerin tarihsel kayıtlarıdır.

# Güncel doğrulama — 1.5.1 — 31.10.2026

Ortak ürün/müşteri/tedarikçi açılır listelerinde yazmadan tıklama, tekrar tıklama, viewport/katman, klavye/tekerlek/kaydırma çubuğu ve üç pencere boyutu kontrolleri gerçek ve paketli Electron içinde geçti. %100/%125/%150 uygulama ölçeği test edildi; %125 açık temaydı. 68/68 veri testi, typecheck/lint/üretim ve satış/cari/ön sipariş regresyonları başarılı. Şema 7 değişmedi. [Ayrıntı ve paket](docs/CHOICES-1.5.1.md).

# Güncel doğrulama — 1.5.0 / şema 7 — 31.10.2026

68/68 veri testi, typecheck/lint/üretim, gerçek ve paketli ön sipariş/sıralama akışları; mevcut cari/satış/aylık UI, tasarım ve marka kontrolleri geçti. 1.4 gerçek koduyla izole veri geçişi korundu. RiaCoding test imzalı tam/yerinde yükseltme NSIS üretildi. Fiziksel NSIS yükseltme ve kamusal imza güveni doğrulanmadı. Ayrıntı: [docs/PREORDERS-1.5.md](docs/PREORDERS-1.5.md).

Aşağıdaki sürümler tarihsel kayıttır.

# Güncel doğrulama — 1.4.0 / şema 6 — 31.10.2026

58/58 veri testi; typecheck/lint/üretim, temel/aylık/yeni cari Electron UI, tasarım regresyonu, paketli cari ve diğer iş akışları geçti. İmzalı NSIS üretildi; gerçek eski 1.3 kodu ile izole veri geçişi ve eski şema koruması doğrulandı. Fiziksel NSIS yerinde yükseltmesi ve kamusal imza güveni doğrulanmadı. Ayrıntı ve güncelleme adımları: [docs/ACCOUNTS-1.4.md](docs/ACCOUNTS-1.4.md).

Aşağıdaki 1.3 ve önceki raporlar tarihsel kayıttır.

# SucukCenter doğrulama kayıtları

**Güncel 1.3.0 / şema v5 doğrulaması:** [Arayüz, takvim, uzun firma adı ve paket doğrulaması](docs/UI-REVIEW.md). [1.2 aylık rapor ve geçmiş tarih kaydı](docs/MONTHLY-REPORT-TESTS.md) önceki ekin sonuçlarını korur.

Aşağıdaki bölüm **1.1 incelemesinin tarihsel kaydıdır**; 1.2 sonuçlarının yerine kullanılmaz. Eski stok tarihi kısıtı ve maliyet dondurma davranışı 1.2'de izlenebilir maliyet sürümleriyle değiştirilmiştir.

## SucukCenter 1.1 inceleme — önceki doğrulama kaydı

**29.10.2026 · Europe/Istanbul**

Windows 10 x64 (10.0.19045), Node.js 24.18.0 / npm 11.16.0; Electron 45.1.0 içindeki Node 24.22.1 ve gerçek better-sqlite3 13.0.3 / SQLite 3.53.4 kullanıldı. Testler Node SQLite uyarlamasıyla değil, uygulamanın yerel SQLite modülüyle çalıştırıldı.

Gerçek işletme verisi açılmadı, değiştirilmedi veya migrate edilmedi. Public yayın, GitHub push ve gerçek kurulum yapılmadı. Geliştirme başlangıcı da ayrı geçici veri klasörüne yönlendirildi. Önceki kurulu paket incelemesi bu sonuçların yerine sayılmadı.

## Aşamalar

| Aşama | Değişiklik / geçiş | Tamamlanan kontroller |
|---|---|---|
| 1 | Boş alış maliyeti, belge araması, kalıcı işlem anahtarı, muhasebe mutabakatı; şema v2 | 18/18 veri testi, tür kontrolü, lint, Electron UI ve NSIS inceleme derlemesi |
| 2 | Tedarikçi cari, kısmi ödeme/iptal, güvenli alış iptali ve ayrı iade, tarihler, bedelsiz seçim; şema v3 | 24/24 veri testi, tür kontrolü, lint, UI ve ikinci paket |
| 3 | Ortak dönem, güncel/dönem sonu ayrımı, aranabilir seçim, varsayılan tedarikçi ve CSV | 27/27 veri testi, tür kontrolü, lint, UI ve üçüncü paket |
| 4 | Doğrulanmış günlük yedek, saklama, sayfalı sorgular, hata/performans ve izole paket testi; şema v4 | **41/41 veri/hata testi**, tür kontrolü, lint, UI, nihai NSIS ve gerçek paketli inceleme çalışması |

Ayrıntı: [Aşama raporları](docs/PHASES.md). Geçişler yalnız sentetik v1/v3 dosyalarında denendi. Her geçişin öncesinde backup ve doğrulama uygulandı; kısmi DDL hatasında eski şema/verinin korunması ayrıca sınandı.

## Son kontrol sonuçları

| Komut | Sonuç |
|---|---|
| `npm run lint` | Başarılı |
| `npm test` | **41 başarılı, 0 hata, 0 atlanan** |
| `npm run build` / `typecheck` | Başarılı |
| `npm run test:ui` | Gerçek Electron penceresinde uçtan uca başarılı |
| `npm run test:performance` | 50.000 satış + 1.000 müşteri ile ölçüldü |
| `npm run dist` | Windows x64 NSIS inceleme `.exe` üretildi |
| `npm run test:package` | Normal paketin ASAR/ana giriş yapısı ve test girişinin dışlanması doğrulandı; gerçek veri açılmadı |
| `npm run build:review-test` | Ayrı paketlenmiş test uygulaması üretildi |
| `npm run test:review-runtime` | Gerçek paketli Electron/better-sqlite3 ile başarı |
| `npm audit` | Anlık tarama **0 güvenlik açığı** raporladı |
| Gizlilik kontrolü | Veritabanı, WAL, geri yükleme dosyaları, ekstreler, `.env`, performans ve paket çıktıları Git dışında |

## Zorunlu kabul örnekleri

1. **5000 Kg × 25 TL:** stok +5000 Kg, maliyet 125.000 TL. 3 Kg × 35 TL satışta stok 4997 Kg, satış 105 TL, çıkış maliyeti 75 TL, brüt kâr 30 TL. 40 TL tahsilatla borç 65 TL; kapat/aç ile korundu.
2. **3 Kg × 5 TL, 10 TL tahsilat, 5 Kg × 5 TL:** müşteri borcu 30 TL.
3. **10 Kg × 10 TL + 10 Kg × 20 TL, 4 Kg × 25 TL satış:** stok 16 Kg, stok maliyeti 240 TL, çıkış maliyeti 60 TL, brüt kâr 40 TL.
4. Aynı ürünün iki kaleminde toplam stok yetersizse belge, kalem, cari, kasa, hareket ve aktivite oluşmadı.
5. Tahsil edilmiş satış iptalinde özgün stok/maliyet döndü, müşteri alacağı oluştu; para iadesi alacağı kapattı. İkinci iptal reddedildi.
6. Aynı operationId/aynı içerik aynı sonucu döndürdü; farklı içerik reddedildi. Farklı anahtarla aynı meşru satış yeni belge oldu. Yeniden açılışta anahtarlar korundu. UI'da başarılı yazımın yanıtı kasıtlı kaybedildi; aynı formun yeniden gönderimi tek satış üretti.
7. **100 TL vadeli alış → 40 TL ödeme → 60 TL borç.** Ödeme iptalinde 100 TL borç ve doğru kasa ters kaydı oluştu.
8. Yapısal olarak sağlam fakat pozitif stoğu hareket toplamıyla çelişen yedek salt okunur doğrulamada reddedildi. Aday dosyanın ana içeriğinin hash'i değişmedi. Geçerli yedek ve geri dönüş yedeğiyle yükleme çalıştı.
9. Sıfır dolgulu belge numarası araması; ilk alışta boş maliyet ve ayrı son alış önerisi; sonradan gelen alışın geçmiş satış kârını değiştirmemesi doğrulandı.
10. Kapat/aç, küçük pencere, popup, klavye seçimi, tarih aralığı, Türkçe hata mesajları ve yükleme/sayfalama akışları gerçek Electron UI'da sınandı.

Ek olarak: çok parçalı tedarikçi iadesinde son kuruş farkı, geçmişi değiştirmeyen dönem iptali, UTC 21:00 Türkiye gün sınırı, CSV toplamları/formül koruması, varsayılan tedarikçinin başka firmadan alışı engellememesi, eski ödemelerin kasa uzlaştırması ve büyük tutarın son kuruşunun BigInt ile gösterilmesi sınandı.

## Hata testlerinin gerçek kapsamı

- **Disk dolu:** Gerçek SQLite sürücüsünde `max_page_count` kotası ve büyük sayfa gerektiren transaction ile `SQLITE_FULL` üretildi. Tüm satış geri alındı. Bilgisayarın gerçek diski doldurulmadı. Otomatik yedeğin ENOSPC hata durumunu başarı olarak göstermemesi ayrıca kontrollü hata enjeksiyonuyla test edildi.
- **Yazma izni yok:** Gerçek salt okunur SQLite bağlantısında `SQLITE_READONLY`; ayrıca yalnız izole test dosyasında Windows NTFS yazma hakkı reddi uygulandı. İzinler geri alındı ve test dosyaları temizlendi.
- **Kilit:** İkinci SQLite bağlantısının yazıcı kilidi ile `SQLITE_BUSY`; ayrı Windows sürecinde `FileShare.None` ile yedek hedefinin kilitlenmesi sınandı.
- **Bozuk yedek:** Geçersiz dosya ve ilişkisel olarak tutarsız SQLite yedeği reddedildi; mevcut veri aynı kaldı.
- **Kesilmiş geri yükleme:** Gerçek Electron Node süreci, özgün dosyanın `.before-restore` adına taşınmasından hemen sonra kasıtlı sonlandırıldı. Sonraki açılış özgün 65 TL borcu kurtardı. Fiziksel elektrik kesintisi yapılmadı.
- **Yazma/aktivite hatası:** Satış ve tedarikçi ödemesinde aktivite yazımı zorla başarısız kılındı; stok, cari, kasa, zaman ve operationId kayıtları geri alındı.
- **Geçiş hatası:** v3→v4 geçişinde kısmi DDL sonrası hata oluşturuldu; yeni tablo/ayarlar geri alındı, v3 kaynak ve doğrulanmış yedek korundu.

## Performans ölçümü

Başlangıç veri kümesi toplu üretilmiş **50.000 sentetik satış, 1.000 sentetik müşteri**, ilişkili kalem, stok, cari, aktivite, zaman ve operationId kayıtlarından oluştu. Ardından 20 gerçek `Store.execute` satış transaction'ı ölçüldü. Pencere testinde dosya bu nedenle 50.020 satış içeriyordu. Test DB'si yaklaşık 51,2 MB idi; gerçek işletme verisi kullanılmadı.

| Ölçüm | Sonuç |
|---|---:|
| DB bağlantısını yeniden açma | 2,34 ms |
| Ana ekran SQL sorgusu | 155,29 ms |
| 50.000 satışın son 50 satırlık sayfası | 361,77 ms |
| Tüm dönem raporu | 206,00 ms |
| Satış transaction ortancası (20 örnek) | **50,06 ms** |
| Satış transaction p95 | 59,52 ms |
| Ana ekran veri cevabı | 21.851 bayt |
| Satış sayfası veri cevabı | 38.198 bayt |
| Yeni Electron süreci: pencere/veri/rapor/IPC doğrulaması hazır | **1,167 sn** |
| İlk günlük yedek + tam muhasebe doğrulaması dahil açılış | **6,750 sn** |

İşletim sistemi disk önbelleği temizlenmedi; bunlar tek bilgisayardaki ölçümlerdir, soğuk disk veya her bilgisayar için süre garantisi değildir. İki pencere ölçümü ayrı Electron süreçlerinde yapıldı; ikinci süreç mevcut test profilini kullandı. Günlük yedeğin tam doğrulaması büyük veride açılışı uzatır. Yedek aynı gün tamamlandıysa tekrar otomatik oluşturulmaz.

Yeniden üretme: `npm run test:performance`. Ham ölçüm ve PNG'ler `artifacts/` altında yereldir ve Git dışında tutulur.

## Görsel ve paket kanıtı

Gerçek Electron pencere içeriklerinin ekran görüntüleri üretildi ve incelendi. Bunlar kurulu Store kodundan çıkarılmış tahmin veya statik tasarım değildir:

- `artifacts/02-dashboard-koyu.png`, `03-dashboard-acik.png`
- `artifacts/04-dar-pencere.png` — 900 px içerik
- `artifacts/06-alis-formu-klavye.png` — aramalı seçim, boş alış maliyeti, küçük popup
- `artifacts/08-dogrulama-hatasi.png` — gerçek sıfır fiyat hata durumu
- `artifacts/07-paketli-inceleme.png` — ayrı paketli test uygulaması

Native dosya seçimi ve onay cevapları testte kontrol edildi; gerçek SQLite backup/restore çalıştı. Native dosya diyaloğunun veya Windows masaüstünün tamamının görseli doğrulanmış sayılmaz. OS takvim açılır penceresinin tüm varyantları ayrıca elle denenmedi.

Paketli inceleme uygulamasında `app.isPackaged=true` doğrulandı. Üretim ana süreci ve renderer aynıydı; yalnız ayrı test giriş noktası Electron'un belge/profil yolunu geçici klasöre yönlendirdi. Normal ASAR paketinin bu test girişini içermediği ayrıca doğrulandı. Geliştirme, UI ve paket testlerinde gerçek Belgeler dosyası açılmadı.

## Nihai inceleme paketi

`review-builds/final/SucukCenter-1.1.0-Inceleme-Kurulum.exe`

Boyut: **133.432.304 bayt**

SHA256:

```text
AD7D38CEFA58F0C93FFBE55DF51CE2AD3829FF4C89C4066068A0988FA7FF57A0
```

Paket imzasızdır. Gerçek kurulum sihirbazı, masaüstü/Başlat kısayollarının oluşması, Windows 11, gerçek sürüm güncellemesi/kaldırması, fiziksel elektrik kesintisi ve çok bilgisayarlı OneDrive senkronizasyonu bu çalışmada doğrulanmadı. GitHub workflow hazırlandı fakat uzaktan çalıştırılmadı. Proje lisansı seçimi yayıncıya bırakıldı; üçüncü taraf bildirimleri eklendi.
