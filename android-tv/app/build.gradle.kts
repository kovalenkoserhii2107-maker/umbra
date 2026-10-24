plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Адрес сайта: в релизе — боевой, для проверки можно подменить (-PsiteUrl=http://…).
val siteUrl = (findProperty("siteUrl") as String?)
    ?: "https://kovalenkoserhii2107-maker.github.io/umbra/?tv=1"

// Номер сборки: в GitHub Actions — номер запуска, локально — время.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    ?: ((System.currentTimeMillis() / 1000 - 1_790_000_000) / 60).toInt()

android {
    namespace = "app.umbra.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.umbra.tv"
        minSdk = 23
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        // Только 32-битный ARM телевизора; нативного кода нет, фильтр — на будущее.
        ndk { abiFilters += "armeabi-v7a" }
        resourceConfigurations += listOf("ru", "uk", "en")
    }

    // Постоянный ключ подписи из секретов GitHub (см. android-tv/README.md);
    // без него релиз подписывается debug-ключом — годится только для проверки.
    val keystore = System.getenv("UMBRA_TV_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = keystore
                storePassword = System.getenv("UMBRA_TV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("UMBRA_TV_KEY_ALIAS")
                keyPassword = System.getenv("UMBRA_TV_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        abortOnError = false
    }
}
