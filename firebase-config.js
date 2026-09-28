/* =========================================================
   إعدادات Firebase الخاصة بـ "موقع الأعضاء"
   =========================================================
   هاد المشروع لازم يكون منفصل بالكامل عن مشروع فيربيس تبع الإدارة.

   كيف تجيب هاي البيانات:
   1) روح لـ https://console.firebase.google.com
   2) أنشئ مشروع جديد باسم مثلاً: technix-members
   3) من إعدادات المشروع (⚙️ Project settings) > "Your apps" > أضف تطبيق ويب (</>) 
   4) انسخ الكود اللي بيظهرلك وحطه بدل القيم تحت
   5) فعّل من القائمة الجانبية:
        - Authentication  → Sign-in method → فعّل "Email/Password"
        - Firestore Database → أنشئ قاعدة بيانات (Start in production mode)
        - Storage → فعّل التخزين (لرفع صور المنتجات/المقالات/المنشورات)
   ========================================================= */

const MEMBER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDE5QQJIn4nEvtql-osn-l9dG3nUyLxAPY",
  authDomain: "xix1-42e9b.firebaseapp.com",
  projectId: "xix1-42e9b",
  storageBucket: "xix1-42e9b.firebasestorage.app",
  messagingSenderId: "866354043758",
  appId: "1:866354043758:web:73e554cc984280b3a37f7f",
  measurementId: "G-Y8QK2BC9HM"
};

/* =========================================================
   إعدادات فيربيس xix2 — مصدر كل المحتوى المنشور (منتجات/مقالات/
   إعدادات البوت/الإعدادات العامة). موقع الأعضاء يقرأ منها فقط
   (قراءة عامة)، والكتابة عليها حصرًا من لوحة تحكم الإدارة.
   ========================================================= */
const CONTENT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVLdmQOrrwHlanoROsvm8s1oS3WLinDT0",
  authDomain: "xix2-97170.firebaseapp.com",
  projectId: "xix2-97170",
  storageBucket: "xix2-97170.firebasestorage.app",
  messagingSenderId: "562238006507",
  appId: "1:562238006507:web:d29fc7af9d916458958aae",
  measurementId: "G-PNBZBHVYMQ"
};


