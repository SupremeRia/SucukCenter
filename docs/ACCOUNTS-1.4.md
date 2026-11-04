> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.4.0 — müşteri cari hesabı ve yükseltme

Tarih: 31.10.2026. Şema: 6. Bu teslimat yerel inceleme içindir; kendiliğinden yayınlanmadı ve gerçek işletme bilgisayarına kurulmadı. Tüm doğrulama kayıtları sentetiktir.

## Değişiklikler

- Müşteri detayında **Cari işlem → Borç ekle / Alacak ekle**. Pozitif tutar, işlem tarihi ve zorunlu açıklama; borçta geçmişten devir/diğer ayrımı; isteğe bağlı referans. Stok, satış, maliyet, kâr ve kasa etkilenmez.
- Tahsilat borcu aşabilir; sıfır borçta avans alınabilir. Form mevcut bakiyeyi, girilen tutarı, sonuç bakiyesini ve avans olarak kalacak kısmı gösterir. Alacaklı müşteride de Tahsilat al erişilebilir; para iadesi ayrıca sunulur. Fiilî iade mevcut müşteri alacağını aşamaz.
- Alacak görünümü `+500,00 TL · Müşteri alacaklı`, borç görünümü `500,00 TL · Müşteri borçlu`, sıfır `Hesap kapalı / bakiye sıfır`. İşaret tek başına anlam taşımaz. Borç ve alacak toplamları müşteri bazında ayrı hesaplanır; ana sayfada ikisi de gösterilir.
- Mevcut depolama işareti değişmedi: pozitif tutar müşteriden alacağımız, negatif tutar müşteriye borcumuzdur. Ekrandaki artı dönüşümü yalnız sunum içindir; eski kayıtlar ters çevrilmedi.
- Cari eklemeler ve iptalleri ekstre, dönem başı/sonu, müşteri listesi, faaliyet geçmişi ve CSV'ye katılır. Satış/tahsilat toplamlarına katılmaz. Tahsilat kasa girişi, para iadesi kasa çıkışıdır; avans satış geliri veya kâr değildir.
- Yanlış cari kayıt detaydan gerekçe ve tarih ile iptal edilir. Kaynak silinmez/değiştirilmez; durum iptal olur ve ayrı ters cari hareket oluşur. Tekrar iptal reddedilir. Aynı kalıcı işlem anahtarı aynı sonucu döndürür; farklı içerikle yeniden kullanılamaz. Kaynak, cari, faaliyet, tarih ve işlem sonucu tek transaction içindedir.
- Müşteri seçiminde ilk 50 sonuç dışında kalan seçili kaydın da bakiye önizlemesi yüklenir.

## Tam kurulum ve mevcut kurulumu yükseltme

**Tek dosya iki kullanım için hazırlanmıştır:**

`review-builds/signed/SucukCenter-1.4.0-RiaCoding-Kurulum.exe`

Yeni Windows x64 bilgisayarda tam kurulum; mevcut SucukCenter kurulumunda yerinde yükseltme için aynı NSIS dosyası kullanılır. Ayrı bir çevrimiçi/delta güncelleme sistemi yoktur; dosya ikinci adla çoğaltılıp ayrı güncelleme paketi olarak sunulmadı. Kullanıcıya Node.js veya veritabanı sunucusu gerekmez.

Korunan kimlik: `com.sucukcenter.desktop`; ürün/exe: `SucukCenter` / `SucukCenter.exe`; NSIS kullanıcı kapsamı `perMachine=false`, mevcut kurulum yolunu algılama, masaüstü/Başlat menüsü kısayolları, `deleteAppDataOnUninstall=false`. NSIS kimliği aynı appId'den türetilir. Kaynakta kurulumun Belgeler verilerini silen bir işlemi yoktur. İşletme verisi ve uygulama ayarları işletim sisteminin Belgeler/SucukCenter/sucukcenter.db yolunda kalır; Belgeler sabit kodlanmamıştır.

`build/safe-update.nsh`, çalışan uygulama bulunursa kullanıcının normal kapatmasını bekler; zorla süreç sonlandırmaz. Sessiz kurulumda da çalışan uygulama veya süreç denetimi hatası kurulumu durdurur. Normal kapanış mevcut WAL checkpoint/kapatma yolundan geçer; bakım sırasında kapanış ertelenir. Kurulum sonunda uygulamayı başlatma seçeneği sunulur. Bu davranış NSIS'e derlendi; aşağıdaki fiziksel yükseltme sınırına dikkat edin.

### Kullanıcı adımları

1. Mevcut uygulamada **Ayarlar → Yedek Oluştur** ile bir yedek alın; uygulama sürümünüzün kurulum dosyasını da saklayın.
2. Uygulamayı normal şekilde kapatın. Mevcut uygulamayı kaldırmayın ve Belgeler/SucukCenter klasörünü silmeyin.
3. **SucukCenter-1.4.0-RiaCoding-Kurulum.exe** dosyasını çalıştırın. Önceki kurulum konumunu kullanın; uygulama açıksa kapattıktan sonra Yeniden Dene seçin.
4. Kurulum bitince uygulamayı açın. Eski veritabanı için şema geçişinden **önce**, SQLite backup API ile `yedekler/gecis-v5-<benzersiz kimlik>.db` oluşturulur ve bütünlük/cari mutabakat doğrulanır. Kaynak sürüm daha eskiyse dosya adında o şema numarası yer alır.
5. Müşteri bakiyelerinizi ve ayarlarınızı kontrol edin; yeni cari işlemler müşteri detayındaki menüdedir.

Geçiş, foreign key açıkken transaction ve geçiş sonrası mutabakatla yapılır. Hata olursa şema değişiklikleri geri alınır; anlaşılır başlangıç hatası ve geçiş öncesi yedek konumu gösterilir. Yeni şemayı desteklemeyen eski uygulama sürümü dosyayı açmayı reddeder. **Geri dönüş için eski uygulama ve onunla uyumlu geçiş öncesi yedek birlikte gerekir**; yalnız eski EXE'yi kurmak şemayı geri çevirmez. Yedeği açık/veritabanı kullanımdayken dosya kopyalayarak değiştirmeyin; uyumlu uygulamanın geri yükleme akışını kullanın. Otomatik eski sürüme dönüş sistemi yoktur.

### İmza ve dosya doğrulama

- Boyut: **134929936 bayt**.
- SHA256: `6AC5C5CCBA5E06C3210B386F1A008DDEDB2DA539F13631D1C778EEB63EE5A6E6`.
- Kurulum, uygulama ve çalıştırılmadan çıkarılan kaldırıcıda **CN=RiaCoding** ile DigiCert zaman damgası görüldü. Önceden kullanıcı tarafından seçilen yerel test sertifikası kullanıldı; özel anahtar dışa aktarılmadı ve güven depolarına eklenmedi.
- Authenticode sonucu `UnknownError`; mesaj güvenilmeyen kökte sonlanan zinciri bildiriyor. **Kamusal yayıncı güveni doğrulanmış değildir, SmartScreen uyarıları kalkmaz.** Ayrıntılar: [SIGNING.md](SIGNING.md).
- Önceki imzalı 1.3.0 kurulumunun SHA256'sı korundu: `9E3A1E5C5A2618FDBC3CF26B46A02B674CCAB236DB2804B4F5A245036B477C3D`.

## Çalıştırılan doğrulamalar

Tam komut çıktıları yerel, Git dışında `artifacts/accounts-*.log` ve `artifacts/upgrade-data-ui.log` içinde bulunur.

| Kontrol | Sonuç |
|---|---|
| Typecheck ve üretim derlemesi | Başarılı; gerçek Windows native SQLite bağımlılığıyla |
| ESLint | Başarılı |
| Veri / hata / migration testleri | **58/58**, sıfır başarısız/atlanan |
| Mevcut temel Electron UI | Başarılı, çevrimdışı |
| Aylık rapor Electron UI | Başarılı; açık borç/alacak etiketlerine uygun beklentilerle |
| Tasarım regresyonu | 3 pencere × 3 uygulama ölçeği × 2 tema; başarılı |
| Yeni cari Electron UI | Gerçek formlar, avans önizleme, satış/iade, gerekçeli iptal, mükerrer IPC, dönem/CSV, yedek/geri yükleme/yeniden açılış; başarılı |
| Yeni cari paketli Electron UI | Ayrı test girişli **packaged=true** uygulamada aynı akış; başarılı |
| Diğer paketli iş akışları | Gerçek Electron/better-sqlite3, stok/satış/tahsilat, maliyet revizyonu, raporlar ve geri yükleme; başarılı |
| İmzalı üretim paketi içerik kontrolü | ASAR, migration6, ana süreç, tüm derlenmiş arayüz/font/logo varlıkları güncel kaynak derlemesiyle eşleşiyor; test giriş noktası yok |
| NSIS üretimi ve imza varlığı | Başarılı; imza güven sınırı yukarıda |

Zorunlu 1–10 senaryoları veri testlerinde kapsandı: 1000 TL geçmiş borçta stok/kasa/ciro/maliyet/kâr sabit; 1500 tahsilatta 500 alacak ve 1500 kasa; 200 satışta 300 alacak ve normal stok düşümü; 300 iadede sıfır; sıfır borçta 750 avans; kasa değişmeden 400 alacak; borç/alacak/tahsilat iptal ve tekrar iptal; anahtar tekrarları; geçmiş ay/devir; restart/backup/restore/migration. Son işlem sonucu yazımında yapay hata ile kaynak/cari/faaliyet geri alımı da doğrulandı. Şema geçişi hatasında eski sürüm/bakiye ve geri dönüş yedeği korunması ayrı test edildi.

### Gerçek eski kod ile veri geçişi

`npm run test:upgrade-data`, korunmuş 1.3.0 ASAR'ından **gerçek eski uygulama kodunu ve arayüzünü** çıkarır. Electron içinde ayrı geçici Belgeler profiliyle ürün, stok, müşteri, satış, tahsilat ve ayar oluşturur. 1.4.0 aynı izole dosyayı açar; müşteri/tedarikçi bakiyeleri, ürün/stok, satış/tahsilat, ayarlar ve özetler eşleşir; doğrulanmış v5 yedeği vardır. Yeni cari işlev ve restart kalıcılığı denenir. Gerçek 1.3 Store kodunun şema 6'yı açık mesajla reddettiği de doğrulanır. Test için önceki 1.3 ASAR dosyası gerekir; public CI bunu varmış gibi varsaymaz.

**Bu veri/runtime geçiş testidir; eski NSIS kurulumu üzerine fiziksel kurulum testi değildir.** Ortamda Hyper-V/VirtualBox/VMware/Windows Sandbox çalıştırma aracı bulunamadı. Gerçek işletme bilgisayarına kurulum yapılmadı. Bu nedenle izole Windows VM üzerinde eski kurulum → yeni NSIS, kurulum yolu/registry/kısayol korunması, açık uygulama engeli ve kurulum sonrası yeniden başlatma henüz uygulamalı doğrulanmadı. Yerinde yükseltme için paket hazırdır; fiziksel yükseltmenin doğrulandığı iddia edilmez. Windows 11, işletim sistemi DPI geçişi ve kamusal sertifika güveni de bu teslimatın doğrulaması dışında kalır.

## Geliştirici komutları

```powershell
npm run build
npm run lint
npm test
npm run test:ui
npm run test:monthly-ui
npm run test:accounts-ui
npm run test:design-ui
npm run test:upgrade-data
# RiaCoding sertifikası yerel depodayken parmak izini yerel ortamda seçin.
npm run dist:signed
$env:SUCUKCENTER_REVIEW_PACKAGE='review-builds/signed/win-unpacked'
npm run test:package
npm run build:review-test
npm run test:review-runtime
$env:SUCUKCENTER_ACCOUNTS_PACKAGED='1'
npm run test:accounts-ui
Remove-Item Env:SUCUKCENTER_ACCOUNTS_PACKAGED
```

Paketli test yolu yalnız `SucukCenterReview` girişinde geçici Documents yönlendirmesidir; üretim paketi çevre değişkeniyle gerçek veri yolunu değiştirmeye izin vermez.
