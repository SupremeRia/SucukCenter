const fs = require('node:fs'),
  crypto = require('node:crypto');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const volumes = ['small', 'medium', 'large'],
  labels = ['Az', 'Orta', 'Yüksek'];
const sql = volumes.map((v) => ({
  a: read('artifacts/audit/' + v + '-before-comparison.json'),
  b: read('artifacts/audit/' + v + '-after-comparison.json'),
}));
const ui = volumes.map((v) => ({
  a: read('artifacts/audit/' + v + '-before-runtime.json'),
  b: read('artifacts/audit/' + v + '-after-runtime.json'),
}));
const sig = read('artifacts/audit/signature.json');
const ms = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pair = (a, b) => ms(a) + ' → ' + ms(b);
let text = `# SucukCenter 1.6.1 — hata denetimi, performans ve temizlik\n\n02.11.2026 · Önceki sürüm 1.6.0 / şema 8; yeni sürüm 1.6.1 / şema 9. Gerçek işletme verisi açılmadı veya test için kopyalanmadı. Gerçek kuruluma kendiliğinden yükleme/geçiş yapılmadı.\n\n## Başlangıç ve aşamalar\n\nBaşlangıçta lint, 76/76 mevcut veri testi, typecheck ve üretim derlemesi başarılıydı. Önceden başarısız bir veri testi bulunmadı. Önce 1.6.0 ASAR kodu ve kaynak karşılaştırması saklandı; sonra aşağıdaki hatalar gerçek Electron ile üretildi. Veri/form doğruluğu, arayüz, ölçülmüş darboğazlar, temizlik ve son paket doğrulaması sırasıyla uygulandı. Geliştirme sırasında yeni kontrollerin yakaladığı sorunlar giderildi; aşağıdaki başarılar yalnız tamamlanmış son çalıştırmalardır.\n\n## Doğrulanıp giderilen hatalar\n\n| Hata ve etkisi | Önceki sürümde kanıt | Kök neden / çözüm |\n|---|---|---|\n| Ön sipariş düzeltmesinde yanlış ürün seçimi; yanlış ürünle yeni belge oluşabilirdi | 65. ürünün kaydı açıldı; seçili ürün 1 geldi | Form bağlamı yalnız ilk 50 ürünü ve satış/alış kalemlerini yüklüyordu. Ön siparişin doğrudan productId alanı atlanıyordu. İlgili belge/sipariş ürünleri sınırlı bağlam sorgusuna eklendi; eksik ürünler yüklenmeden form açılmıyor. Gerçek arayüzde miktar düzeltmesi kaydedildi ve ürün 65 olarak kaldı. Yükleme hatasında yanlış varsayılanla form açılmadığı test edildi. |\n| Sayfa değişiminde önceki ekranın satır/sayfalama anlık görüntüsü görünüyordu | Satış sorgusu 900 ms geciktirilince önceki sayfanın bağlamından 10 satır + başlık görünüyordu | Son yüklenen sayfa ayrı izleniyor. Farklı sayfanın verisi gösterilmiyor; aynı sayfada arama yüklenirken input korunuyor. Regresyonda geçiş sırasında eski satır sayısı 0. |\n| Gecikmeli kayıt sonrası eski sayfaya ait yenileme | Tema kaydı geciktirilip Müşteriler'e geçildi: son sorgu yeniden home idi | Kaydet/bakım geri çağrısı açıldığı andaki reload fonksiyonunu tutuyordu. Son tamamlanmada güncel ekranın yenilemesi kullanılıyor; sonuç customers → customers. |\n| Her aramada ve görünmeyen raporda gereksiz hesaplama | Büyük veride 20 arama sorgusuna 20 dönem raporu; finans açılışında gizli yıllık hesap | Rapor etkileri her snapshot nesnesine bağlıydı. Kayıt değişikliği sayacı ve ilgili ekran/dönem bağımlılıkları kullanıldı. Yıllık rapor yalnız sekmesi açıldığında hesaplanıyor. Arama yazısı anında, sorgusu 150 ms gecikmeyle güncelleniyor; sayfa değişiminde eski arama taşınmıyor. |\n| Uzun hesap/yedek/geri yüklemede ana süreç duraklaması | Büyük veride ana süreç 20 ms zamanlayıcısının en uzun aralığı 16.720 ms | Veritabanı işlerini tek bağlantı ve sıralı kuyrukla ayrı worker thread yürütüyor. Ana pencerenin en uzun ölçülen aralığı 36 ms. Uzun ilk hazırlıkta bekleme ekranı gösteriliyor. |\n\nArama odağının yeniden kaybolması, seçim listesinin kendiliğinden kapanması veya temel hesap akışlarında yeni bir bozulma doğrulanmadı; bunların mevcut regresyonları tekrar çalıştırıldı. Seçili tedarikçinin sayfa geçişine sızması ilk inceleme adayıydı; normal kullanıcı yolunda modal gezinmeyi engellediğinden yeniden üretilemedi. Gezinme bağlamı yine de açıkça sıfırlanıyor; bu aday doğrulanmış hata gibi sunulmuyor. Yerel SelectField yardımcı bileşeninin required parametresini yok sayması da sözleşmesine uygun hale getirildi; mevcut isteğe bağlı seçim yolu aramalı olduğundan bu, canlı akışta yeniden üretilmiş hata olarak sayılmadı.\n\n## Veri, kalıcılık ve güvenlik\n\nPara kuruş, miktar binde birim ve maliyet hesapları korunur. Satış/stok/cari/kasa/ödeme tahsisi/teslimat ve düzeltme bağlantıları mevcut transaction içinde kalır. Worker kuyruğu yalnız tek bağlantıda, aralarında backup/restore da olacak biçimde işleri sırayla yürütür. Kayıp yanıtta otomatik finansal tekrar yapılmaz; mevcut kalıcı işlem anahtarı koruması sürer. Güvenli kapatma önce kabul edilmiş işleri bitirir, sonra checkpoint ve bağlantı kapatmasını tamamlar. Yeni komutlar kapanış sırasında reddedilir.\n\nÖzet önbelleği bağlantıya özeldir. SQLite total_changes ve data_version ile kendi/dış bağlantı yazılarında geçersiz olur. Dış transaction içinde görüntü okunursa önbelleğe alınmaz; geri alınmış ara durum dışarı sızmaz. Geri yükleme yeni bağlantı oluşturduğu için eski önbellek kullanılmaz. Düzeltme, iptal, dış bağlantı yazısı, rollback ve restore ayrı testlerle doğrulandı.\n\nŞema 9 yalnız operations sonuç/tarih, ödeme tahsisi ve düzeltme yeni kayıt bağlantıları için indeks ekler. Eski migration'lar korunur; geçişten önce doğrulanmış SQLite backup alınır. Kronolojik maliyetin sonraki hareket kontrolü mevcut tarih indeksinden başlayacak şekilde düzenlendi. Normal satış/alışta tüm ürün geçmişinin her kez taranması kaldırıldı; geçmiş işlemde aynı tam kronolojik denetim devam eder. Foreign key, WAL, FULL kalıcılık, immutable geçmiş, stok ve tutar sınırları azaltılmadı.\n\nRenderer'ın dosya sistemi/SQL erişimi yok. contextIsolation, sandbox, kapalı nodeIntegration, güvenilir ana-frame IPC kontrolü ve CSP korunur. Worker arayüzü renderer'a açılmaz. Bakım sırasında yazma/ikinci bakım engellenir; salt okunur istekler aynı güvenli kuyruğa alınır. Gecikmeli bakım sonrasında güncel ekran yenilenir.\n\n## Ölçüm ortamı ve veri\n\nWindows ${sql[2].a.environment.windows} x64; ${sql[2].a.environment.cpu.trim()}; ${sql[2].a.environment.cpus} mantıksal işlemci; ${sql[2].a.environment.memoryGiB} GiB RAM; Electron ${sql[2].a.environment.electron}, gömülü Node ${sql[2].a.environment.node}. Veritabanları yerel geçici klasörlerdeydi; Belgeler'deki işletme veritabanı kullanılmadı. Aynı kapalı sentetik SQLite dosyaları ayrı geçici kopyalarla iki sürüme verildi. Eski kod gerçek 1.6.0 ASAR'dan çıkarıldı. Ölçümler aynı bilgisayarda sırayla çalıştırıldı.\n\n| Başlangıç kaydı | Az | Orta | Yüksek |\n|---|---:|---:|---:|\n`;
for (const [key, title] of [
  ['customers', 'Müşteri'],
  ['products', 'Ürün'],
  ['suppliers', 'Tedarikçi'],
  ['sales', 'Satış'],
  ['sale_items', 'Satış kalemi'],
  ['purchases', 'Alış'],
  ['collections', 'Tahsilat'],
  ['preorders', 'Ön sipariş'],
  ['preorder_events', 'Sipariş hareketi'],
  ['operations', 'İşlem anahtarı'],
])
  text += '| ' + title + ' | ' + sql.map((s) => s.a.counts[key]).join(' | ') + ' |\n';
text += `\nHareketlerin çoğu tek yoğun üründe toplandı; uzun ürün geçmişi/maliyet yükü özellikle sınandı. 65 farklı ürünlü alış ayrıca işlevsel testtedir. Bu veri dağılımı her işletmenin veri dağılımını temsil etmez.\n\n### SQLite işlevleri — medyan ms, önce → sonra\n\nOkuma/yazma işlevleri beş kez, geçmiş önizleme üç kez ölçüldü. Geçmiş commit, güvenli backup ve restore tek uzun örnektir; bunlara istatistiksel p95 iddiası yoktur. Bu süreler React formu, IPC ve ekran yenilemesini içermez. İlk şema geçişi ayrı tutulur.\n\n| İşlev | Az | Orta | Yüksek |\n|---|---:|---:|---:|\n`;
for (const [key, title] of [
  ['home', 'Ana ekran sorgusu'],
  ['salesPage', 'Son satış sayfası'],
  ['customerSearch', 'Müşteri arama sorgusu'],
  ['productSearch', 'Ürün arama sorgusu'],
  ['formRecord', 'Düzenlenecek kaydın hazırlanması'],
  ['purchaseSave', 'Alış transaction'],
  ['saleSave', 'Satış transaction'],
  ['collectionSave', 'Tahsilat transaction'],
  ['monthlyReport', 'Aylık rapor'],
  ['customerStatement', 'Müşteri ekstresi'],
  ['historicalPreview', 'Geçmiş işlem önizleme'],
  ['historicalCommit', 'Geçmiş işlem commit'],
  ['backupVerified', 'Doğrulanmış yedek'],
  ['restoreVerified', 'Doğrulanmış geri yükleme'],
])
  text +=
    '| ' +
    title +
    ' | ' +
    sql.map((s) => pair(s.a[key].medianMs, s.b[key].medianMs)).join(' | ') +
    ' |\n';
text += `\n### Gerçek Electron — gözlenen ms, önce → sonra\n\nHer hacimde aynı adımlar bir tur çalıştırıldı. Normal açılış ikinci açılışta, şema geçişi olmadan ölçüldü. Arama süresi klavye yazımını ve sonuçların yerleşmesini de kapsar. Form/seçim açma, tıklama ve animasyonları içerir. Zamanlayıcı aralığı ana sürecin yanıt verebilirliğini ölçer; ekran kare hızı veya fiziksel fareyle pencere sürükleme ölçümü değildir.\n\n| Akış | Az | Orta | Yüksek |\n|---|---:|---:|---:|\n`;
for (const [key, title] of [
  ['startupMs', 'Normal açılış / ilk kullanılabilir ekran'],
  ['customerNavigationMs', 'Müşteriler sayfasına geçiş'],
  ['searchToSettledMs', 'Yazımdan arama sonucuna'],
  ['formOpenMs', 'Yeni müşteri formu'],
  ['choiceOpenMs', 'Satış formu + müşteri listesi'],
  ['financeNavigationMs', 'Finans sayfasına geçiş'],
  ['backupIPC', 'IPC üzerinden güvenli yedek'],
  ['restoreIPC', 'IPC üzerinden geri yükleme'],
  ['mainEventLoopMaxGapMs', 'Uzun bakımda en büyük ana süreç aralığı'],
])
  text += '| ' + title + ' | ' + ui.map((s) => pair(s.a[key], s.b[key])).join(' | ') + ' |\n';
text += '\n| Aramadaki istek | Az | Orta | Yüksek |\n|---|---:|---:|---:|\n';
for (const key of ['snapshot', 'report', 'annual'])
  text +=
    '| ' +
    key +
    ' | ' +
    ui
      .map((s) => (s.a.searchRequests[key] || 0) + ' → ' + (s.b.searchRequests[key] || 0))
      .join(' | ') +
    ' |\n';
text += `\nHızlanmayan alanlar açıkça korunuyor: normal açılışta ${ui[2].a.startupMs} → ${ui[2].b.startupMs} ms ile yaklaşık 0,1 sn ek maliyet var. Küçük veri/form/seçim sürelerindeki birkaç-on ms fark için hızlanma iddiası yok. Güvenli backup/restore toplam süresi anlamlı biçimde kısalmadı; doğrulamaları azaltmak yerine ana süreçten ayrıldı. Büyük veride ilk 8→9 geçişi, yedek ve mutabakat dahil yaklaşık ${(ui[2].b.firstRunReadyMs / 1000).toFixed(1)} sn sürdü; pencere yaklaşık ${ui[2].b.firstWindowCreatedMs} ms'de oluşturuldu ve uzun hazırlık için bekleme ekranı var. Bu bir kezlik geçiş normal açılışla karıştırılmamalıdır.\n\n### Yerel kanıtlar\n\nÖnce/sonra ham örnekler: artifacts/audit/*-comparison.json ve *-runtime.json. Fixture dosyaları artifacts/audit/*-after-measurement.db adlarında, yalnız sentetik veridir ve Git'e alınmaz. Yerel tekrar için bu fixture'lar ve artifacts/audit/legacy-1.6.0 altındaki eski ASAR kodu gerekir. Güncel arayüz regresyonları bunlardan bağımsızdır; test:audit-ui kendi geçici verisini oluşturur.\n\n| Aynı karşılaştırma girdisi | SHA256 |\n|---|---|\n`;
for (let i = 0; i < volumes.length; i++)
  text +=
    '| ' +
    labels[i] +
    ' | ' +
    crypto
      .createHash('sha256')
      .update(fs.readFileSync('artifacts/audit/' + volumes[i] + '-after-measurement.db'))
      .digest('hex')
      .toUpperCase() +
    ' |\n';
text += `\n## Güvenli temizlik\n\nKaynak kullanımı ve import/dinamik yollar incelendikten sonra 13 kullanılmayan UI yardımcısı kaldırıldı: AlertDialogTrigger, AlertDialogMedia, AlertDialogAction; CardHeader, CardTitle, CardDescription, CardAction, CardFooter; DialogTrigger, DialogClose, DialogFooter; TableFooter, TableCaption. Yalnız tanım/export olarak bulunuyorlardı. Kullanılan overlay/portal/başlık/içerik ve düğmeler korundu.\n\nSağ tık ve üç noktanın tekrarlanan menü öğeleri tek RecordMenuItems bileşeninde toplandı; erişim seçenekleri, kayda bağlılık, klavye ve odak davranışı korundu. Kullanılmayan Button importu da kaldırıldı. Temizlik öncesi kopyalar ve yalnız temizlik farkı artifacts/audit/cleanup-before ve cleanup.patch içinde ayrı incelenebilir.\n\nMigration, eski veri kurtarma, güvenli kapatma, otomatik/elle backup, geri yükleme ve mevcut testler kaldırılmadı. Bağımlılıklar topluca yükseltilmedi; kullanılan bağımlılıklar korundu. Dinamik stiller için yeterli kanıt olmayan silmeler yapılmadı. Çalışma zamanında zaten tree-shake edilen yardımcılar için büyük hız kazancı iddiası yok.\n\n## Son doğrulama\n\n- Başlangıç: 76/76 veri testi; mevcut typecheck/lint/build başarılı.\n- Son: **79/79 veri testi**, typecheck, lint ve üretim derlemesi başarılı. Yeni testler işçi kuyruğu/idempotency/rollback/kapanış/yeniden açılış/backup/restore; önbellek geçersizliği ve transaction rollback izolasyonu; ilk sayfa dışı ürün ve 65 kalemli belge bağlamını kapsar.\n- test:ui, test:monthly-ui, test:accounts-ui, test:preorders-ui, test:records-ui, test:choices-ui, test:design-ui, test:brand, test:performance başarılı. Mevcut testler test süresini azaltmak için kaldırılmadı.\n- test:audit-ui: 65. ürünle gerçek düzeltme kaydı, yükleme hatasında yanlış formu engelleme, gereksiz rapor olmaması, isteğe bağlı yıllık rapor, eski sayfa verisinin gösterilmemesi, gecikmeli kayıttan sonra güncel sayfa yenilemesi ve bakımda güvenli okuma başarılı. Son iki hatanın 1.6.0 öncesi kanıt logları da saklandı.\n- Gerçek Electron: 3 pencere boyutu ×3 ölçek ×2 tema; arama odağı/imleç/klavye, takvim ve tarih hataları, uzun firma adları, çok kalemli form, korumalı taslak, boş liste, rapor ve yatay kaydırma kontrolleri başarılı.\n- Paketlenmiş inceleme uygulamasında yeni audit akışı %100 ve %150; tam kayıt/arama/menü/düzeltme/arşiv testleri %100/%125/%150 başarılı. Testler çevrimdışı. Chromium/Electron ölçek faktörü Windows üzerinde değiştirildi; işletim sisteminin tüm masaüstü DPI ayarı değiştirilmedi.\n- Paketlenmiş review-runtime: gerçek better-sqlite3, satış/tahsilat, kapat/aç, güvenli backup/restore, onay/vazgeç, bozuk yedek, geri dönüş yedeği, aylık/yıllık rapor ve geçmiş maliyet onay/red/kalıcılık başarılı.\n- Paket içeriği karşılaştırması: güncel worker/service, migration ve derlenmiş arayüz varlıklarıyla eşleşiyor; üretim paketinde test Documents yönlendirmesi yok. Eski test yalnız main.js içinde openMigrating metnini arıyordu; yeni mimaride migration çağrısını worker'da ve servisi main'de denetleyecek şekilde güncellendi.\n- **Gerçek 1.6.0 ASAR → 1.6.1**: sahte müşteri/tedarikçi/ürün, alış/satış/tahsilat, ayrılmış ödeme ve kısmi teslimat, kalan ürün borcu ve ayarlar korundu. Şema 8 geçiş yedeği doğrulandı; geçiş sonrası düzeltme ve yeniden açılış kontrol edildi. Eski kod şema 9'u reddetti.\n\n## Tam kurulum / yerinde yükseltme\n\nTek dosya iki kullanım içindir: **${sig.File}**. Dosya yolu: review-builds/signed/${sig.File}.\n\nYeni bilgisayarda tam kurulum yapar; mevcut kullanıcı hesabında aynı uygulamanın kurulumunu kaldırmadan yerinde yükseltmek için de hazırlanmıştır. Ayrı bir delta güncelleme servisi değildir.\n\n1. Mevcut uygulamada Ayarlar → Yedek Oluştur ile isteğe bağlı ek bir yedek alın.\n2. SucukCenter'ı normal biçimde kapatın.\n3. EXE'yi mevcut kurulumun kullanıcı hesabında çalıştırın; mevcut kurulum klasörünü kullanın. Önceki sürümü kaldırmanız gerekmez.\n4. Veriler işletim sisteminin döndürdüğü Belgeler/SucukCenter konumunda kalır. İlk geçiş doğrulanmış şema yedeği oluşturur; büyük veride hazırlığın tamamlanmasını bekleyin.\n\nBoyut: **${sig.Bytes} bayt**. SHA256: **${sig.SHA256}**.\n\nİmzalayan: **${sig.Signer}**; DigiCert SHA256 zaman damgası doğrulandı. Bu, kullanıcı onaylı yerel test sertifikasıdır. Windows durumu ${sig.Status}: sertifika kökü güvenilir değildir. Ticari yayıncı güveni/SmartScreen uyarısının kalktığı iddia edilmez.\n\n**Doğrulanmayanlar:** fiziksel NSIS kurulum/yükseltme sihirbazı, kayıt defteri/kısayollar, Windows 11 ve gerçek işletme verisiyle çalışma. Doğrulanan önceki sürüm yükseltmesi eski/yeni uygulama koduyla gerçek izole runtime/veritabanı geçişidir; fiziksel kurulum testi gibi sunulmaz. Gerçek işletme verisine otomatik kurulum yapılmadı.\n`;
text=text.replace('Her hacimde aynı adımlar bir tur çalıştırıldı. Normal açılış ikinci açılışta, şema geçişi olmadan ölçüldü.','Her hacimde aynı adımlar bir tur çalıştırıldı. Normal açılış ikinci açılışta, şema geçişi olmadan ölçüldü. Bu üç hacimli karşılaştırmada otomatik yedek kapalıydı.');
text=text.replace('### Yerel kanıtlar','Ayrı mevcut test: 50.000 satış / 1.000 müşteriyle normal açılış 1.164 ms, doğrulanmış otomatik yedek içeren açılış 9.110 ms ölçüldü. Bu farklı veri seti üç hacimli tabloyla doğrudan karşılaştırılmadı; güvenli otomatik yedeğin ilk günlük açılış maliyeti korunur.\n\n### Yerel kanıtlar');
fs.writeFileSync('docs/AUDIT-1.6.1.md', text);
console.log('Audit report written', text.length);
