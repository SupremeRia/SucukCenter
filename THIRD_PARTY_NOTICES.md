# Üçüncü taraf bildirimleri

SucukCenter kaynak kodunun proje lisansı henüz yayıncı tarafından seçilmedi. `private: true` npm yayımını engeller; üçüncü taraf MIT lisansları uygulamanın tüm kaynak koduna kendiliğinden lisans atamaz. Public kaynak görünürlüğü proje için açık kaynak lisansı atamaz.

Arayüzde kaynak olarak kullanılan shadcn/ui bileşenleri MIT lisanslıdır: Copyright (c) 2023 shadcn. Tam bildirim `third_party/shadcn-MIT.txt` içinde korunur ve uygulama paketine eklenir. Kaynak: [shadcn/ui lisansı](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).

Inter yazı tipi uygulamayla birlikte yerel olarak paketlenir (`@fontsource-variable/inter` 5.3.0). SIL Open Font License 1.1 metni `third_party/Inter-OFL.txt` içinde ve paket dağıtımında korunur. Font kaynağı: [Fontsource Inter](https://fontsource.org/fonts/inter), [Inter kaynakları](https://github.com/rsms/inter). Çalışma sırasında font indirilmez.

Güncel SC program PNG/ICO ve tam yazılı açılış PNG varlıkları kullanıcı tarafından sağlanmıştır; yeni logo üretilmemiştir. Bu varlıkların ayrıca bir açık lisansı belirtilmemiştir; yeniden kullanım hakkı varsayılmamalıdır. Önceki SVG üreticisi çalışma marka akışından çıkarılmıştır. @resvg/resvg-js geliştirme aracının MPL-2.0 bildirimi kendi paketinde korunur; üretim çalışma zamanı bağımlılığı değildir. FFmpeg yalnız Playwright geliştirme kaydı için kullanılır ve uygulama paketine eklenmez.

Electron/Chromium, React, Radix UI, Tailwind, Lucide, Zod, better-sqlite3 ve diğer paketlerin kendi lisans bildirimleri kendi dağıtımlarında korunur. Electron'un `LICENSE` ve `LICENSES.chromium.html` dosyaları Windows uygulama klasöründe yer alır. Paketlenen npm bağımlılıkları kendi lisans metinlerini taşır. Bu dosya proje lisansı veya üçüncü taraf bildirimlerinin yerine geçmez.
