# Güncel marka varlıkları

Güncel program işareti public/brand/program.png, kanonik Windows simgesi public/brand/program.ico, tam yazılı açılış logosu public/brand/splash.png dosyasıdır. Bunlar kullanıcının sağladığı varlıklardır; mutlak geliştirme yolları paketlenmez. build/icon.ico kanonik ICO ile byte düzeyinde aynıdır.

ICO, 16/24/32/48/64/128/256 piksel 32-bit RGBA PNG katmanları içerir. Her iki PNG 1254×1254’tür ve sıfır/kısmi alfa içerir. Eşik ≥24/255 görünür sınırlar: program x149/y97/957×1066; açılış x48/y241/1124×702. Alfa, renk ve kenar yumuşatması kaynakta korunur. Eski S sembolü ve eski ikonlar çalışma varlıklarından çıkarılmıştır.

Açılış yalnız görünür alfa sınırı kırpılarak yaklaşık 600 DIP genişlikte gösterilir. Kaynak resim değiştirilmez. Maske bir kez hesaplanır ve dikey aynı şeritler birleştirilir. Electron setShape deneysel API’si kullanılır; [resmî davranış](https://www.electronjs.org/docs/latest/api/base-window#winsetshaperects-windows-linux-experimental). Kontrollü native tıklama kanıtı henüz yoktur.
