# Temiz kaynaktan derleme

Windows x64, Node.js 24.x ve npm 11.16.0+ gerekir. Kaynağı [depodan](https://github.com/SupremeRia/SucukCenter) alın. Kurulum/geliştirme sırasında internet gerekir; son kullanıcı işlevleri çevrimdışıdır.

```powershell
npm ci
npx playwright install ffmpeg
npm run lint
npm run typecheck
npm test
npm run build
npm run test:ui
npm run test:expenses-ui
npm run test:monthly-ui
npm run test:accounts-ui
npm run test:preorders-ui
npm run test:records-ui
npm run test:choices-ui
npm run test:calendar-focus-ui
npm run test:audit-ui
npm run test:appearance-ui
npm run test:startup-ui
npm run test:design-ui
npm run test:brand
npm run test:performance
npm run dist
npm run test:package
npm run build:review-test
npm run test:review-runtime
```

Normal imzasız NSIS çıktısı review-builds/final altındadır. Yerel test sertifikasıyla paketleme `npm run dist:signed`; sertifika kullanıcı deposunda önceden bulunmalıdır. Bu komut sertifika oluşturmaz, anahtar dışa aktarmaz veya Windows güven deposunu değiştirmez.

Güvenilir üretim sertifikası kullanıcı sertifika deposunda mevcutsa SC_PRODUCTION_CERT_THUMBPRINT ortam değişkeniyle parmak izi verilir ve `npm run dist:production` çalıştırılır. Ön kontrol zinciri, özel anahtar erişimini ve kendinden imzalı olmamasını doğrular; SHA-256 + RFC3161 zaman damgası, uygulama/kaldırıcı/kurulum imzalama sırası electron-builder tarafından uygulanır. Son dosyaların Authenticode durumunu ayrıca doğrulayın. HSM veya bulut imzalama hizmeti hesabı bu depoya dahil değildir; erişim yoksa üretim imzası üretilemez. Parola, PFX veya anahtar kaynağa yazılmaz.

`npm run build:brand`, sağlanan kalıcı PNG/ICO dosyalarını okur, alfa/boyut metaverisini doğrular ve kanonik ICO’yu build/icon.ico’ya kopyalar; yeni logo çizmez. Yedi ICO boyutu 16/24/32/48/64/128/256’dır. Açılış maskesi alfa ≥24/255 piksellerinden, görünür sınırlar kırpılarak ve aynı dikey şeritler birleştirilerek bir kez kurulur. setShape deneysel Windows API’sidir.

Geliştirme komutu `npm run dev` ayrı geçici geliştirme Documents kullanır. Üretim uygulaması test yolu değişkenlerini dikkate almaz. Paketli test uygulaması yalnız doğrulanmış geçici review klasöründe açılır; elle gerçek işletme dosyasına yönlendirilmemelidir.

Eski sürüm veri yükseltmesi için önceki 1.7.0’ın gerçek app.asar dosyasını artifacts/upgrade-baselines/1.7.0.asar konumuna koyup `npm run test:upgrade-data` çalıştırın. Bu dosya kaynak deposuna eklenmez. Fiziksel NSIS yükseltme testi, izole Windows VM üzerinde ayrıca yapılmalıdır.

Startup testinde FFmpeg yalnız kayıt aracı olarak kullanılır; son kullanıcı paketine eklenmez. docs/media/splash.webm Electron sayfası kaydıdır. Native tıklama testi için isteğe bağlı tests/splash-probe.ts ayrı sentetik alt pencere sağlar; bu testin sonucu kontrollü işletim sistemi tıklamaları olmadan başarılı sayılmaz. Uygulamayı gerçek işletme makinesine otomatik kuran test yoktur.
