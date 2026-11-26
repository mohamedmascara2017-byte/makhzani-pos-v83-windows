# بناء مخزني POS لويندوز — V8.4

1. ارفع `Makhzani_POS_V8_4_Windows_Variants_Reports_DriveBackup.zip` إلى جذر مستودع GitHub.
2. أنشئ في المستودع المسار `.github/workflows/build-windows.yml` والصق محتوى ملف `build-windows.yml` المرفق بشكل منفصل.
3. افتح تبويب Actions واختر **Build Makhzani POS for Windows** ثم اضغط **Run workflow**.
4. بعد نجاح البناء افتح التشغيل ثم **Artifacts**، وحمّل `Makhzani-POS-Windows-Installer`.
5. فك ضغط الـ Artifact على Windows وشغّل ملف التثبيت `.exe` الموجود داخله.

ملف ZIP هو مصدر المشروع وليس EXE جاهزاً. يجب أن يبقى اسمه مطابقاً تماماً للاسم المذكور في الخطوة الأولى.
