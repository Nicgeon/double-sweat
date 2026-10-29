package app.doublesweat.mobile.securestore

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Verschlüsselter Schlüssel-Wert-Speicher. Die Werte liegen als AES-256-GCM-Päckchen in privaten SharedPreferences,
 * der Schlüssel nur im Android Keystore (nicht auslesbar, nicht Teil von Backups). Genutzt für die Zugangsdaten
 * (SecureStorePlugin) und für den Push-Endpunkt, den der Push-Dienst auch ohne laufende Oberfläche braucht.
 */
@SuppressLint("ApplySharedPref") // commit ist gewollt: Tokens müssen vor dem Weiterlaufen gespeichert sein
class Vault(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Der Wert, oder null, wenn es keinen gibt oder er nicht mehr lesbar ist (dann wird er vergessen). */
    fun get(name: String): String? {
        val stored = prefs.getString(prefKey(name), null) ?: return null
        return try {
            String(SealedBox.open(secretKey(), name, Base64.decode(stored, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (e: GeneralSecurityException) {
            // Schlüssel oder Wert unbrauchbar (z. B. nach einer Wiederherstellung): vergessen statt festhängen
            forget(name)
        } catch (e: ProviderException) {
            forget(name)
        } catch (e: IllegalArgumentException) {
            forget(name)
        }
    }

    /** @throws GeneralSecurityException wenn der Keystore nicht verfügbar ist */
    fun put(name: String, value: String) {
        val sealed = SealedBox.seal(secretKey(), name, value.toByteArray(Charsets.UTF_8))
        // commit statt apply: Tokens müssen auf dem Datenträger sein, bevor die App weiterläuft
        if (!prefs.edit().putString(prefKey(name), Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()) {
            throw GeneralSecurityException("Speichern fehlgeschlagen")
        }
    }

    fun remove(name: String) {
        prefs.edit().remove(prefKey(name)).commit()
    }

    private fun forget(name: String): String? {
        remove(name)
        return null
    }

    private fun prefKey(name: String) = "v1.$name"

    private fun secretKey(): SecretKey = synchronized(LOCK) {
        val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        generator.generateKey()
    }

    private companion object {
        const val PREFS = "ds_secure"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "ds_secure_store_v1"
        val LOCK = Any()
    }
}
