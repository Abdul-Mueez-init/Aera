plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

import java.util.Properties
import java.io.FileInputStream

val keystoreProps = Properties()
val keyFile = rootProject.file("key.properties")
if (keyFile.exists()) {
    keystoreProps.load(FileInputStream(keyFile))
}

@Suppress("DEPRECATION")
android {
    namespace = "com.example.aera"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        buildConfig = true
        resValues = true
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProps.getProperty("keyAlias")
            keyPassword = keystoreProps.getProperty("keyPassword")
            storeFile = keystoreProps.getProperty("storeFile")?.let { file(it) }
            storePassword = keystoreProps.getProperty("storePassword")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // IMPORTANT: Set your unique reverse-DNS application ID before store distribution.
        // Example: com.yourcompany.aera
        // See: https://developer.android.com/studio/build/application-id.html
        applicationId = "com.example.aera"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "environment"

    productFlavors {
        create("development") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
        }
        create("production") {
            dimension = "environment"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

// Task to validate release signing configuration - only runs when release builds are executed
tasks.register("validateReleaseSigning") {
    doLast {
        val releaseSigning = android.signingConfigs.getByName("release")
        if (keystoreProps.isEmpty() ||
            releaseSigning.keyAlias.isNullOrBlank() ||
            releaseSigning.keyPassword.isNullOrBlank() ||
            releaseSigning.storeFile == null ||
            releaseSigning.storePassword.isNullOrBlank()) {
            throw GradleException(
                "Release signing configuration missing or incomplete. " +
                "Create android/key.properties with keyAlias, keyPassword, storeFile, and storePassword. " +
                "All four properties are required for release builds."
            )
        }
    }
}

// Make all release assemble tasks depend on validation
afterEvaluate {
    tasks.named("assembleRelease") {
        dependsOn("validateReleaseSigning")
    }
    tasks.named("bundleRelease") {
        dependsOn("validateReleaseSigning")
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
