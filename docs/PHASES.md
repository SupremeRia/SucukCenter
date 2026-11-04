> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# 04.11.2026 — 1.7.0 giderler

1. Mevcut 79 veri testi, lint/typecheck ve mevcut gider/kasa modeli kontrol edildi.
2. Tek mevcut gider kaynağı genişletildi; ad/açıklama/yöntem metaverisi, şema 10 ve doğrulanmış geçiş yedeği eklendi.
3. Giderler menüsü, ortak tarih/ad filtreleri, 50 hareket sayfalama, form ve menüler tamamlandı.
4. Düzeltme/iptal/tarihli tam iade, ortak net sonuç ve marj hesapları eklendi.
5. 83 veri testi, tüm mevcut UI regresyonları, 18 tasarım kombinasyonu, paketli gider/runtime, 1.6.1 veri yükseltmesi ve imzalı paket doğrulandı.

Ayrıntı: [EXPENSES-1.7.md](EXPENSES-1.7.md). Gerçek veri/NSIS fiziksel kurulum testi yapılmadı.

# 02.11.2026 — 1.6.1 denetim aşamaları

1. Mevcut lint/typecheck/build ve 76 veri testi; gerçek 1.6.0 ASAR, az/orta/yüksek sentetik ölçümler saklandı.
2. İlk sayfa dışı ürünün yanlış seçilmesi üretildi; eksiksiz form bağlamı ve yükleme başarısızlığında kapalı düzenleme eklendi.
3. Eski sayfa satırları ve gecikmeli kayıttan sonra eski ekranın yenilenmesi üretildi; bağlam/yeni ekran yenilemesi düzeltildi.
4. Sorgu geciktirme, gereksiz rapor etkilerinin ayrılması, indeksler, güvenli özet önbelleği, tarih indeksiyle stok kontrolü ve sırayla çalışan DB işçisi uygulandı. Aynı veri dosyalarında yeniden ölçüldü.
5. 13 kullanılmayan UI yardımcı ve menü tekrarları ayrı temizlik farkıyla kaldırıldı. Kurtarma/migration/backup/testler korundu.
6. 79 veri testi, kaynak/paketli gerçek Electron ve ölçek matrisi, eski sürümden sentetik yükseltme, imzalı EXE ve paket içeriği doğrulandı. Fiziksel NSIS kurulumu yapılmadı.

Kanıt ve ölçümler: [AUDIT-1.6.1.md](AUDIT-1.6.1.md).

# 01.11.2026 — 1.6.0 kayıt yönetimi

Arama odak kaybı gerçek Electron içinde üretildi ve ortak yükleme davranışı düzeltildi. Bağımlılık kontrollü sil/arşiv/etkinleştir, sağ tık/üç nokta/klavye menüleri ve transaction içinde ters/yeni kayıtla düzeltme eklendi. Şema 8, 76 veri testi ve önceki sürümden izole veri geçişi: [RECORDS-1.6.md](RECORDS-1.6.md). Gerçek işletme verileriyle çalışma yapılmadı.

# Seçim listeleri — 1.5.1 — 31.10.2026

Ortak açılır liste kapanma hatası yeniden üretildi, giriş/portal odak ve tıklama yönetimi düzeltildi. Bütün ortak seçim alanlarına uygulandı; gerçek ve paketli Electron, farklı pencere/ölçek ve arama/klavye/kaydırma kontrolleri geçti. Şema ve iş kuralları değişmedi. [Teslimat](CHOICES-1.5.1.md).

# Ön sipariş ve sıralama — 1.5.0 / şema 7 — 31.10.2026

Para avansı ile ürün teslim yükümlülüğü ayrıldı. Sabit fiyat, tahsis kaynakları, kısmi teslim ve satış/maliyet bağlantısı, fiziksel iade, kalan iptali, ürün/birim dönem bakiyeleri, CSV, bekleyen teslim filtreleri ve tüm müşterilere uygulanan başlık sıralaması tamamlandı. 68/68 veri testi ve gerçek/paketli Electron akışları geçti. Önceki 1.4 koduyla veri geçişi doğrulandı; fiziksel NSIS yerinde yükseltme açık kaldı. [Teslimat raporu](PREORDERS-1.5.md).

# Cari hesap ekleri — 31.10.2026 / 1.4.0

Borç/alacak kaynak kayıtları ve gerekçeli ters hareket, avans tahsilatı, açık bakiye etiketleri, ekstre/CSV entegrasyonu ve şema 6 geçişi tamamlandı. 58/58 veri testi, gerçek/paketli Electron akışları ve eski 1.3 koduyla veri geçişi geçti. RiaCoding test imzalı tam/yerinde yükseltme NSIS paketi üretildi. İzole Windows VM bulunmadığından fiziksel NSIS yükseltme doğrulaması açık kaldı; tamamlanmış sayılmadı. [Ayrıntılı teslimat](ACCOUNTS-1.4.md).

# Aşamalı geliştirme doğrulaması — 29.10.2026

## Arayüz yenileme — 1.3.0 tamamlandı

18 farklı referans ekran incelendi. Ortak tema/yazı/marka sistemi, SVG/PNG/7 boyutlu ICO, yerel Inter, modern dönem ve işlem takvimi, sabit form işlemleri, koşullu alanlar, değişiklik koruma, okunur tablolar, uzun unvan sarmalama, rapor sekmeleri ve gruplu ayarlar uygulandı. Şema v5 ve muhasebe motoru korundu.

53/53 veri testi; tür kontrolü, lint, üretim, mevcut UI, aylık UI, yeni 3×3×2 ölçek/tema matrisi ve logo kontrolleri geçti. NSIS, güncel varlıklarla ASAR eşleşmesi ve ayrı paketli Electron iş akışları doğrulandı. Windows görev çubuğunda yeni simge yerel görüntüyle kontrol edildi. Gerçek işletme verisi veya kurulu uygulama değiştirilmedi. Sınırlar ve önce/sonra: [UI-REVIEW.md](UI-REVIEW.md).

## Ek geliştirme — 1.2.0 / şema v5 tamamlandı

Mevcut v4 kaynak incelendi; önceki sonuçlar yeniden koşulmuş sayılmadı. Aylık ekstre ve güvenli CSV ürün dökümü; aylık/yıllık işletme raporu, alış/ödeme ayrımı ve birimlere göre miktarlar; date-only işlem günü; tarihsel stok denetimi ve kullanıcı onaylı değişmez maliyet sürümleri aşamalı eklendi. Ay seçimi iş hareketi oluşturmaz, dönem kilitlemez. Özgün tutarlar ve gerçek kayıt zamanları korunur.

Bu oturumda **53/53 veri testi**, tür kontrolü, lint, üretim derlemesi, mevcut Electron UI ve yeni aylık UI, büyük veri ölçümü, NSIS paketi, ASAR ve ayrı paketli gerçek Electron testi geçti. Geçmiş işlem maliyeti onaysız reddedildi, onayla kaydedildi ve yeniden açılışta korundu. Gerçek Belgeler dosyası açılmadı/geçirilmedi; kurulum ve public yayın yapılmadı. Ayrıntı ve sınırlar: [güncel ek raporu](MONTHLY-REPORT-TESTS.md).

---

Aşağıdaki aşama 1–4 bölümleri 1.1 geliştirmesinin tarihsel kaydıdır. Geçmiş stok tarihi engeli ve sabit maliyet davranışı 1.2'de yukarıdaki sürümlü hesaplamayla değişmiştir.

Gerçek işletme verisi açılmadı veya migrate edilmedi. Kaynak depoda AGENTS.md bulunmadı. Önceki kurulu paket incelemesi güncel görsel veya yerel sürücü testinin yerine sayılmadı. Aşağıdaki testler kaynak koddan, Electron'un yerel better-sqlite3 sürücüsüyle çalıştırıldı.

## Aşama 1 — tamamlandı

- Alışta maliyet boş; son gerçek alış ayrı öneri etiketi. Eski alış fiyatları değiştirilmedi.
- `1`, `S-1`, `S-0001`, `#S-0001` ve G karşılıkları; Türkçe firma araması.
- Şema v2: değişmez `operations` tablosu. Kanonik içerik, SHA256 ve sonuç işlemle atomik kaydedilir. Yeniden gönderimde formun anahtarı korunur.
- Salt okunur yedek mutabakatı: stok/maliyet hareketleri, belge/kalem, cari, kasa ters kayıtları, ilgili belge ve işlem sonucu bağlantıları.
- Eski şemaya geçiş öncesi SQLite backup ve doğrulama. Eski uygulama daha yeni şemayı reddeder. Hatalı geçiş transaction'ı geri alınır.
- Kontroller: **18/18 veri testi**, TypeScript, lint, üretim derlemesi ve gerçek Electron UI geçti. Yanıtın kaybolması testte zorlandı; ikinci gönderim yeni satış üretmedi.
- NSIS inceleme paketi `review-builds/phase-1` altında üretildi; ASAR yapısı doğrulandı. Paket gerçek Belgeler verisiyle başlatılmadı. Kurulum sihirbazı denenmedi; public yayın yapılmadı.

İleri aşamaların sonuçları tamamlanan kontrol çıktıları alındıkça aşağıya eklenir.

## Aşama 2 — tamamlandı

- Şema v3: tedarikçi cari, ödeme, iade, değişmez işlem/kayıt zamanı, tedarikçi referansı, geçiş incelemesi.
- Eski peşin ödemeler mevcut kasa tutarından türetildi; yöntem bilinmediğinde “Eski kayıt” olarak korundu. Ödeme kaydı olmayan alış için ödeme varsayılmadı; inceleme notu üretildi. Tutarsız kaynak dosyada geçiş, tahmin yapmak yerine durur.
- Alış iptali yalnız ilgili ürünlerde sonraki stok hareketi yoksa özgün maliyetle yapılır. Aksi halde açıklayıcı engel ve ayrı güncel maliyetli iade akışı sunulur; cari azaltım ile maliyet farkı ayrıdır.
- Sıfır fiyat açık bedelsiz seçimi ve gerekçe gerektirir; eski sıfır fiyatlar değiştirilmez. Stok tarihleri son ürün hareketinden eski olamaz. Kayıt zamanı değişmez.
- **24/24 veri testi**, tür kontrolü, lint, üretim derlemesi ve gerçek Electron UI geçti. Tedarikçi kısmi ödeme/iptal ve iade formları da çalıştırıldı.
- İkinci NSIS inceleme paketi `review-builds/phase-2` altında üretildi. Gerçek işletme dosyası açılmadı/geçiş yapılmadı; yayın ve kurulum yapılmadı.

## Aşama 3 — tamamlandı

- Ortak tarih aralığı / tek gün seçimi; Europe/Istanbul gün sınırları. Geçersiz aralıkta rapor reddedilir.
- Orijinal satış ve iptal ayrı dönem olaylarıdır. İptal sonraki dönemde işlendiğinde geçmiş satış dönemi sessizce değişmez. Güncel borç/stok, dönem başı/sonu bakiye ve dönem hareketleri ayrı etiketlenir.
- Satış kârı, gider, fire, tahsilat, para iadesi ve tedarikçi iade maliyet farkı ayrı hesaplanır.
- Türkçe sıralanan, aramalı ve klavye destekli ürün/müşteri/tedarikçi alanları; isteğe bağlı varsayılan tedarikçi. Başka tedarikçiden alış engellenmez.
- Sayfalı müşteri ekstresi ve toplamları doğrulanan, formül enjeksiyonunu engelleyen açık kullanıcı isteğine bağlı CSV aktarımı.
- **27/27 veri testi**, TypeScript, lint, üretim derlemesi ve Electron arayüz testi geçti. Klavyeyle ürün seçimi ve native dosya diyaloğu üzerinden CSV yazımı da test edildi. Gerçek Electron pencere görüntüleri incelendi; kurulu eski paketin görüntüsüne dayanılmadı.
- Üçüncü NSIS inceleme paketi `review-builds/phase-3` altında üretildi; ASAR yapısı kontrol edildi. Gerçek işletme verisi kullanılmadı.

## Aşama 4 — tamamlandı

- Şema v4: yedek durumu/saklama ve sorgu indeksleri. Geçiş öncesi doğrulanmış yedek, kısmi geçiş hatasında rollback.
- Günlük doğrulanmış otomatik yedek, aynı gün atlama, kullanıcı zorlaması, 1–30 saklama sınırı. Başarısız yedekte son başarı zamanı ilerlemez. Elle/geçiş/geri dönüş yedekleri korunur; WAL/SHM zorla silinmez.
- OneDrive için sade açıklama; ağ engeli korunur, eşitleme kapatılmaz ve veri taşınmaz.
- Renderer'ın veri isteği artık sınırlı SQL görünüm/sayfa sorgusudur; tüm geçmiş `Store.snapshot()` üzerinden taşınmaz. Ayrı dönem ve cari sorguları, arama ve odaktaki eski kayıt bağlantıları vardır. Rapor yüklenirken eski sonuç başarı olarak sunulmaz.
- **41/41 otomatik veri/hata testi**, tür kontrolü, lint, üretim derlemesi ve genişletilmiş Electron UI geçti. Disk kotası, NTFS yazma reddi, SQLite/Windows dosya kilidi, bozuk yedek ve süreç kesilmesi gerçek yerel sürücüyle izole ortamda sınandı. Yedek ENOSPC durumunun bildirilmesi kontrollü enjeksiyonla ayrıca test edildi; fiziksel disk doldurulmadı.
- 50.000 satış / 1.000 müşteri: ana sorgu 155 ms, satış ortancası 50 ms, Electron hazır olma 1,167 sn; doğrulanmış günlük yedek dahil 6,750 sn. Yöntem ve sınırlar [sonuç raporunda](../TEST-RESULTS.md).
- Nihai NSIS inceleme paketi ve ayrı paketli test uygulaması üretildi. Paketli uygulamada gerçek Electron/better-sqlite3 ile kabul senaryosu, kapat/aç, backup/restore, vazgeçme, geri dönüş yedeği, bozuk dosya ve çevrimdışı 10 ekran geçti.
- Normal paket test girişini içermez. Hiçbir paket gerçek işletme dosyasını açarak başlatılmadı. Public yayın veya gerçek veride geçiş yapılmadı. Native OS dosya diyaloğunun görüntüsü, gerçek kurulum ve Windows 11 ayrıca elle doğrulanmalıdır.
