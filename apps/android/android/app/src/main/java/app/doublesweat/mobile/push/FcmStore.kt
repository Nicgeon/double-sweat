package app.doublesweat.mobile.push

import android.content.Context
import android.util.Base64
import app.doublesweat.mobile.securestore.Vault
import java.security.GeneralSecurityException
import org.json.JSONObject

/**
 * Merkt sich Token und Schlüssel für Firebase Cloud Messaging. Der Dienst bekommt neue Tokens und Nachrichten auch,
 * wenn die Oberfläche nicht läuft; die App meldet ein geändertes Token beim nächsten Start dem Server. Alles liegt
 * im [Vault] (AES-GCM, Schlüssel im Android Keystore). Der private Schlüssel verlässt das Gerät nie.
 */
class FcmStore(context: Context) {
    private val vault = Vault(context)

    fun keys(): WebPushCrypto.KeySet? {
        val raw = vault.get(KEYS) ?: return null
        return try {
            val json = JSONObject(raw)
            WebPushCrypto.KeySet(
                privateKey = decode(json.getString("private")),
                publicKey = decode(json.getString("public")),
                auth = decode(json.getString("auth")),
            )
        } catch (e: Exception) {
            null
        }
    }

    /** Das Schlüsselpaar, bei Bedarf neu erzeugt. */
    @Throws(GeneralSecurityException::class)
    fun ensureKeys(): WebPushCrypto.KeySet {
        keys()?.let { return it }
        val created = WebPushCrypto.generateKeys()
        vault.put(
            KEYS,
            JSONObject()
                .put("private", encode(created.privateKey))
                .put("public", encode(created.publicKey))
                .put("auth", encode(created.auth))
                .toString(),
        )
        return created
    }

    fun token(): String? = vault.get(TOKEN)

    @Throws(GeneralSecurityException::class)
    fun saveToken(token: String) = vault.put(TOKEN, token)

    /** Token samt Schlüsseln, in der Form, die der Server für die Anmeldung braucht. */
    fun registration(): Registration? {
        val token = token() ?: return null
        val keys = keys() ?: return null
        return Registration(token, encode(keys.publicKey), encode(keys.auth))
    }

    fun clear() {
        vault.remove(TOKEN)
        vault.remove(KEYS)
    }

    private fun encode(bytes: ByteArray) =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun decode(value: String) = Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private companion object {
        const val TOKEN = "fcm.token"
        const val KEYS = "fcm.keys"
    }
}
