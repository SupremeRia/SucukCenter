> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# SucukCenter 1.2.0 — aylık rapor ve geçmiş tarih doğrulaması

29.10.2026 · Europe/Istanbul · Windows 10 x64 · şema v5

Bu ek mevcut kaynak üzerinde uygulandı. Önceki 1.1 sonuçları yeni oturumda çalıştırılmış kabul edilmedi. Gerçek Belgeler veritabanı açılmadı; şema geçişleri, arayüz ve paket denemeleri yalnız sentetik geçici verilerde yapıldı. Kurulum veya public yayın yapılmadı.

## Uygulanan aşamalar

1. Mevcut rapor, müşteri ekstresi, tarih metadata'sı, v4 geçiş/yedek sistemi ve IPC incelendi; çalışan modüller korundu. Ekstreye brüt satış, satış iade/iptal, net satış, yürüyen bakiye, ürün dökümü ve ayrı güncel bakiye eklendi. CSV aynı sorguyu kullanır.
2. Ortak yıl/ay seçimi, Bu ay/Önceki ay, ay okları ve özel aralık; aylık işletme alış/ödeme ayrımı; Kg/Litre/Adet dökümleri ve Ocak–Aralık ayrıntı tablosu eklendi. Güncel ay bugüne kadar gösterilir. Ay seçimi ve raporlar yalnız okur; dönem kapatma, silme, sıfırlama veya kilitleme yoktur.
3. Yeni formlar date-only `occurredOn` gönderir. Ayrı `event_days` tablosu ve özgün `event_meta.recorded_at` korunur. Tarih verilmezse Türkiye'de bugün kullanılır; gelecek gün açık mesajla reddedilir. Eski `occurredAt` istekleri desteklenir. Tarih idempotency içeriğine dahildir.
4. Eski genel geçmiş-stok-tarihi engeli kaldırıldı. İlgili ürünler işlem günü + değişmez hareket numarasıyla değerlendirilir. Aynı güne yeni kayıt günün sonuna eklenir. Ara stok negatifse ürün/tarih/eksik miktar gösterilip tüm işlem geri alınır. Mevcut maliyetler değişiyorsa önizleme/onay gerekir; araya yeni işlem girerse eski onay reddedilir.
5. Özgün kalemler/hareketler güncellenmez. Düzeltmeler `cost_revisions` ve `movement_cost_versions` tablolarına eklenir; `effective_movements` güncel türetilmiş maliyeti sunar. Satış tutarı, cari, tahsilat ve gerçek kayıt zamanı maliyet değişti diye yeniden yazılmaz. Satış iadesi, tedarikçi iade/iptali ve fire aynı kronolojiyle uzlaştırılır. Alış iptalinin stok çıkışı kendi gününün ortalama maliyetinden, cari ters kaydı özgün bedelden hesaplanır; fark ayrı raporlanır.
6. v4→v5 geçişi doğrulanmış SQLite geçiş yedeğinden sonra transaction içinde yapılır. Mutabakat güncel maliyet sürümlerini ve tarihsel stok doğruluğunu da denetler. Otomatik/elle yedek ve geri yükleme sistemi korunur.

## Bu oturumda tamamlanan kontroller

| Kontrol | Sonuç |
|---|---|
| `npm test` | **53 geçti, 0 başarısız, 0 atlanan**; gerçek Electron içindeki better-sqlite3 |
| `npm run build` | Tür kontrolü, ana süreç ve üretim React derlemesi geçti |
| `npm run lint` | Geçti |
| `npm run test:ui` | Mevcut temel iş akışları gerçek Electron'da geçti |
| `npm run test:monthly-ui` | Yeni aylık/geçmiş tarih iş akışları gerçek Electron'da geçti |
| `npm run test:performance` | 50.000 satış/1.000 müşteri ve 50.020 hareketi etkileyen maliyet düzeltmesi geçti |
| `npm run dist` | Windows x64 NSIS kurulum paketi üretildi |
| `npm run test:package` | Normal ASAR giriş noktası ve test yönlendirmesinin üretim paketinde bulunmaması doğrulandı |
| `npm run build:review-test` ve `test:review-runtime` | Ayrı paketlenmiş Electron uygulamasında yeni rapor/geçmiş tarih ve mevcut iş akışları geçti |
| `npm audit` | 0 bilinen açık |

Sürümler: Electron 45.1.0, gömülü Node 24.22.1, better-sqlite3 13.0.3, electron-builder 26.18.0. Gerçek yerel SQLite modülü kullanıldı; Node SQLite uyarlaması yoktur.

## Kabul senaryoları

- Ağustos müşteri devri **100 TL**, satış **300 TL**, tahsilat **150 TL**: kapanış **250 TL**. Eylül tahsilatı **50 TL**, güncel bakiye **200 TL**; Ağustos dökümüne girmez. Eylül açılışı 250 TL. Ayrı müşterinin kayıtları karışmaz. 61 hareketin iki sayfasında son bakiye ve toplamlar özetle eşleşir.
- Ağustos alış **10.000 TL**, Ekim alış **4.000 TL**; Ekim'de eski borca **2.000 TL** ödeme Ekim alışını artırmaz. Ekim'de programa girilen **15 Ağustos tarihli 1.000 TL** ek alış Ağustos'u **11.000 TL** yapar, Ekim'i 4.000 TL bırakır. Stok/tedarikçi cari/peşin ödeme kasa bağlantılarının işlem günü 15 Ağustos, gerçek kayıt zamanı Ekim olarak korunur.
- Uygun geçmiş alış/satış sonraki hareketlere rağmen kabul edilir. 10 Kg ×10 TL alış, sonraki 4 Kg satış, araya 10 Kg ×20 TL alış: eski satış maliyeti **40→60 TL**, stok **16 Kg /240 TL**. Önizlemenin rollback'i, onaysız ret, onaylı kayıt, tekrar istekte tek sonuç, özgün kalem/zamanın değişmemesi, yedek mutabakatı ve yeniden açılış doğrulandı.
- Bugünkü stok yeterliyken geçmişte 1 Kg eksik bırakan satış ürün/tarih/eksik miktarla reddedilir. Ürün, cari, kasa, zaman, aktivite, maliyet sürümü ve işlem anahtarı kısmen kalmaz. Aktivite hatasında ve maliyet sürümünden sonraki işlem anahtarı yazım hatasında tam rollback doğrulandı.
- Geçmiş alış satış iptali, tedarikçi iade/iptali ve fire maliyetlerini uzlaştırır. Önceki ayın asıl satışı korunur; sonraki ay iptal ters hareket olarak görünür. Maliyet revizyonundan sonra yapılan yeni satış iptali güncel türetilmiş satış maliyetini geri koyar.
- Güncel ay/ay ortası, geçmiş ay, boş ay, farklı yıl, 2024 Şubat **29 gün**, 2025 Şubat **28 gün**; Türkiye UTC21 gün sınırı ve 2015 kış UTC22 sınırı doğrulandı. Varsayılan bugün, geçersiz/gelecek gün ve aynı anahtarın farklı günle kullanılması kontrol edildi.
- Gerçek Electron'da aylık ekstre/CSV, Ağustos↔Eylül, Bu ay, yıl/ay, yıllık satırdan ayrıntı, artık yıl, maliyet onayı/vazgeçme, vazgeçme/hata sonrası form tarihinin korunması ve yeniden açılış geçti. Renderer hata listesi boştu; bağlantı çevrimdışıydı.
- Paketlenmiş ayrı uygulamada `app.isPackaged=true` ve izole Documents yolu doğrulandı. Satış/tahsilat, yeniden açılış, yedek/geri yükleme/onaydan vazgeçme/geri dönüş yedeği/bozuk yedek, 10 ekran; aylık/yıllık rapor, geçmiş maliyet önizleme/onay/red ve yeni maliyetin yeniden açılışta kalıcılığı geçti.
- Önceki 5000 Kg ×25 TL alış →3 Kg ×35 TL satış →stok4997, brüt kâr30, tahsilat40, borç65 senaryosu yeniden geçti. SQLite disk kotası/SQLITE_FULL, yazıcı kilidi, salt okunur bağlantı, NTFS izin reddi, Windows dosya kilidi ve restore sırasında süreç kesilmesi testleri de yeniden çalıştı.

## Ölçüm

İzole sentetik 50.000 satış/1.000 müşteri, ardından 20 ölçülen satış. Disk önbelleği temizlenmedi; sonuçlar bu makine ve koşullara aittir.

| Ölçüm | Süre |
|---|---:|
| Yeni Electron profilinde pencere/veri/rapor hazır | 983 ms |
| Doğrulanmış günlük yedek dahil açılış | 5.030 ms |
| Ana sayfa SQL görünümü | 134,87 ms |
| Son 50 satış sayfası | 272,14 ms |
| Tüm dönem raporu | 204,78 ms |
| Satış transaction ortancası /p95 | 30,99 /57,27 ms |
| 50.020 maliyet hareketini etkileyen geçmiş alış önizlemesi | 805,34 ms |
| Aynı geçmiş alışın onaylı atomik kaydı | 823,58 ms |

Normal sıradaki girişlerde tüm geçmiş yeniden oynatılmaz. Geçmiş kayıtlar ve maliyet referanslı iptaller ilgili ürünlerin geçmişini değerlendirir; çok büyük tek ürün geçmişinde süre veri büyüklüğüyle artar. Ekran listeleri/ekstreler SQL üzerinden 50 satırlı sayfalardır. Yıllık özet 12 aylık hesaplamadır; büyük veri üzerinde yıllık tablo gecikmesi ayrıca ölçülmedi.

## Görsel doğrulama ve sınırlar

Gerçek Electron görüntüleri incelendi: `artifacts/09-aylik-musteri.png`, `10-gecmis-maliyet-onayi.png`, `11-aylik-finans.png`. `12-tarihsel-stok-hatasi.png` otomatik UI kanıtıdır. Ekranlar sentetiktir; üretime örnek kayıt eklenmez.

Native dosya diyaloğundaki seçim/onay yanıtları testte kontrol edilir; gerçek SQLite backup/restore çalışır. OS takviminin bütün elle giriş varyantları, native diyalog görseli, Windows 11, kurulum/güncelleme/kaldırma sihirbazı, fiziksel elektrik kesintisi, gerçek diskin tamamen doldurulması ve çok bilgisayarlı OneDrive eşitlemesi doğrulanmadı. Çok kullanıcılı rol, resmî dönem kilidi ve müşteri için kısmi satış iadesi bu ekin kapsamı dışındadır. Paket imzasızdır; proje lisansı yayıncı kararı bekler.

## İnceleme paketi

`review-builds/final/SucukCenter-1.2.0-Inceleme-Kurulum.exe`

Normal kurulum paketi gerçek Belgeler veritabanını kullanır; bu çalışmada o paket başlatılmadı. Paketli test ayrı Documents alanı kullandı. Güvenli kaynak incelemesi: `npm ci`, ardından `npm run dev` (ayrı geliştirme veri alanı).

Boyut: **133.438.479 bayt**.

SHA256:

```text
B83BC22A6DBE019DF4673CE0F9FCA71994AA612EC790353E6AE699899F90201E
```
