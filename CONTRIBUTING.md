# Katkı

Kaynak görünürdür; proje için açık kaynak lisansı henüz seçilmemiştir. Lisans veya hak sahipliği varsaymayın. Üçüncü taraf bildirimlerini koruyun.

- Gerçek işletme verisiyle geliştirme/test yapmayın. İzole sentetik fixture kullanın.
- Para kuruş, miktar binde birim; transaction ve mükerrer kayıt anahtarlarını koruyun.
- Eski migration, backup, checkpoint, kurtarma ve immutable geçmişi kaldırmayın.
- UI seçimlerini/arama odağını koruyun; eski IPC yanıtlarının yeni ekranı ezmesine izin vermeyin.
- Temalarda ortak token kullanın; metni yalnız renkle açıklamayın.
- Marka varlıklarını yeniden üretmeyin; sağlanan kanonik PNG/ICO’yu kullanın.
- BUILD.md’deki lint/typecheck/veri/build ve ilgili UI/paket kontrollerini çalıştırın. Önemli hataya tekrar testi ekleyin.
- NSIS fiziksel güncellemesi ile runtime/veri migration testini ayrı raporlayın. Kontrol edilmemiş Windows/DPI/monitör kapsamına başarı yazmayın.
- Sırlar, veritabanları, yedekler, yerel profil, derleme çıktıları ve gerçek verili görüntüler commit edilmez. EXE yalnız Releases varlığıdır.

Yayınlanan etiket veya dosya sessizce değiştirilmez; düzeltme yeni sürümle çıkar. Başarısız zorunlu kontrolü bulunan paket kararlı sürüm değildir.
