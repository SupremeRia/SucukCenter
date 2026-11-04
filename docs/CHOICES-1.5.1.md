> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.5.1 — seçim listelerinin kapanma/görünürlük düzeltmesi

31.10.2026. Şema 7 korunur; finans, stok ve sipariş kuralları değişmez. Gerçek işletme verisine test kaydı eklenmedi, uygulama gerçek kurulum üzerine kendiliğinden kurulmadı.

Ürün/müşteri/tedarikçi seçimleri aynı `SearchableChoice` bileşenini kullanıyordu. Yazmadan fareyle açılan listenin kaybolması gerçek Electron'da yeniden üretildi: liste açıldıktan sonra elemanı bulunamaz hale geliyordu. Önceki arayüz testleri kutuya yazarak seçim yaptığından bu etkileşim hatası yakalanmamıştı.

## Düzeltme

- Giriş kutusu, açılan listenin dışına tıklanmış gibi değerlendirilip kapatılmıyor. Odak kaybında koşulsuz kapanış kaldırıldı; dışarı tıklama, Escape ve Tab ile kapanış korunuyor.
- Liste açıkken kutuya tekrar tıklamak listeyi kapatmıyor. Kapalı ve odaklı kutuya tıklamak yeniden açıyor. Seçim sonrasında odağın kutuya dönmesi listeyi tekrar açmıyor.
- Formun otomatik odağı menüyü kendiliğinden açmıyor. Fareyle tıklama, yazma veya ok tuşları listeyi açıyor.
- Açılışta yerel kayıtlar yeniden sorgulanıyor; eski arama yanıtları yeni sorgunun sonucunu ezemiyor.
- Liste kutuya bağlı, ekran sınırlarına sığan, gerektiğinde yukarı açılabilen portal olarak kalıyor. Genişlik kutuyla eşleşiyor, yükseklik kullanılabilir alanla sınırlanıyor. Tek, tutarlı CSS kuralı kullanılıyor.
- Klavyede Home/End/ok tuşları aktif seçeneği yalnız listenin içinde kaydırıyor. Tüm formu kaydırmıyor. Fare tekerleği ve kaydırma çubuğu da çalışıyor.

Bu ortak düzeltme ön sipariş/ürün alacağı, müşteri satışları, gelen siparişler, tahsilat, müşteri para borç/alacak formları, tedarikçi ödeme/iade ve ürün kartındaki varsayılan tedarikçi gibi ortak seçim bileşenini kullanan bütün yerlerde geçerlidir.

## Gerçek uygulama kontrolleri

`npm run test:choices-ui` yeni regresyon testidir; CI'a da eklendi. Sahte 65 ürün, 65 müşteri ve 65 tedarikçi yalnız geçici test veritabanında oluşturulur. Üretim uygulaması bunları eklemez.

- Fareyle, yazmadan ilk açma ve yeniden tıklama.
- Listenin girişe bağlılığı, pencere sınırları içinde kalması ve pencerenin üstünde tıklanabilir görünmesi; gerçek koordinat ve `elementFromPoint` kontrolleri.
- Modal içindeki tekerlek/kaydırma çubuğu, Home/End ve aktif satırın görünürlüğü; Escape, Tab ve seçim sonrası kapanış.
- İlk 50 kaydın dışındaki ürünün aranıp seçilmesi.
- Ön sipariş müşteri/ürün; satış müşteri/ürün ve altıncı kalem; gelen sipariş tedarikçi; ürün kartı varsayılan tedarikçi; tahsilat müşteri seçimi.
- Üç pencere boyutu: başlangıç 1440×940, 1366×768 ve 860×640.
- %100, %125 ve %150 **uygulama ölçeği**; %125 çalışması açık temada, diğerleri koyu temada. İşletim sisteminin DPI ayarı değiştirilmedi.
- Ayrı test girişli paketlenmiş Electron uygulamasında `packaged=true` ile aynı kontroller, çevrimdışı çalışma ve sıfır renderer hatası.

Sonuçlar: seçim testleri ve mevcut satış/cari/ön sipariş Electron akışları başarılı; **68/68 native veri testi**, typecheck, ESLint ve üretim derlemesi başarılı. Üretim ASAR'ı, ana süreç ve arayüz/font/logo varlıkları güncel derlemeyle eşleşiyor; üretim paketinde test giriş noktası yok.

Tam çıktılar yerel ve Git dışında: `artifacts/choices-before.log`, `choices-after.log`, `choices-125-light.log`, `choices-150.log`, `choices-packaged.log`, `choices-data.log`, `choices-lint.log`, `choices-package.log`, `choices-*-regression.log`. Görseller `artifacts/choices/` altındadır; farklı denemeler aynı örnek görsel dosyalarını güncelleyebilir.

## Kurulum / güncelleme

`review-builds/signed/SucukCenter-1.5.1-RiaCoding-Kurulum.exe`

- Boyut: **134940472 bayt**.
- SHA256: `A4C287AD4755891BB2CBF431D405D8CB91AC5B2384A5D04D25DCA9A041DDBA08`.
- RiaCoding yerel test imzası ve DigiCert zaman damgası kontrol edildi. Windows zincir sonucu güvenilmeyen kök nedeniyle `UnknownError`; kamusal yayıncı/SmartScreen güveni sağlandığı iddia edilmez.

Uygulamadan yedek alıp normal kapatın; kaldırmadan bu kurulumu mevcut konuma uygulayın. Aynı dosya tam kurulum ve yerinde güncelleme içindir. Veritabanı şeması değişmediğinden 1.5.0 → 1.5.1 için yeni migration yoktur. Kurulum kullanıcı verilerini ve ayarlarını yeniden oluşturmaz. Gerçek işletme bilgisayarına kurulum ve fiziksel installer yükseltme testi yapılmadı; paketli testler ayrı geçici Documents profiliyle çalıştı.

Yeni seçim testi için `SUCUKCENTER_CHOICES_PACKAGED=1`, önceden `npm run build:review-test` ile oluşturulan ayrı paketi seçer. `SUCUKCENTER_CHOICES_SCALE` testin Chromium ölçeğini ayarlar. Bunlar üretim uygulamasına veri yolu müdahalesi sağlayan özellikler değildir.
