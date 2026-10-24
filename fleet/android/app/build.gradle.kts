import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The same Firebase settings file the control panel uses (fleet/firebase-config.json)
@Suppress("UNCHECKED_CAST")
val firebase = JsonSlurper().parse(rootProject.file("../firebase-config.json")) as Map<String, String>
fun str(key: String) = "\"" + (firebase[key] ?: "") + "\""

android {
    namespace = "app.rafiq.driver"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.rafiq.driver"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.1"
        buildConfigField("String", "FIREBASE_API_KEY", str("apiKey"))
        buildConfigField("String", "FIREBASE_PROJECT_ID", str("projectId"))
        buildConfigField("String", "FIREBASE_APP_ID", str("androidAppId"))
        buildConfigField("String", "FIREBASE_SENDER_ID", str("messagingSenderId"))
        buildConfigField("String", "FIREBASE_STORAGE_BUCKET", str("storageBucket"))
    }

    // One fixed key, so every new APK installs over the old one without uninstalling
    signingConfigs {
        create("rafiq") {
            storeFile = file("rafiq-driver.keystore")
            storePassword = "rafiqdriver"
            keyAlias = "rafiq"
            keyPassword = "rafiqdriver"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("rafiq")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("rafiq")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
