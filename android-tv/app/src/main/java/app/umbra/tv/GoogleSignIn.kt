package app.umbra.tv

import android.app.Activity
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.util.concurrent.Executor

/**
 * Вход через Google-аккаунт, уже добавленный на телевизор: системный выбор
 * аккаунта → ID-токен Google → сайт входит в Firebase (signInWithCredential).
 * Внутри WebView Google вход не разрешает, поэтому он здесь, в приложении.
 */
class GoogleSignIn(
    private val activity: Activity,
    private val emit: (state: String, text: String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executor { main.post(it) }
    private var cancel: CancellationSignal? = null

    fun start() {
        cancel?.cancel()
        val signal = CancellationSignal().also { cancel = it }
        val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        CredentialManager.create(activity).getCredentialAsync(
            activity, request, signal, executor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val credential = result.credential
                    if (credential is CustomCredential &&
                        credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                    ) {
                        emit("token", GoogleIdTokenCredential.createFrom(credential.data).idToken)
                    } else {
                        emit("error", "unsupported")
                    }
                }

                override fun onError(e: GetCredentialException) {
                    Log.w(TAG, "Google sign-in: ${e.type}: ${e.message}")
                    emit(
                        "error",
                        when (e) {
                            is GetCredentialCancellationException -> "cancelled"
                            is NoCredentialException -> "no_account"
                            else -> "failed"
                        },
                    )
                }
            },
        )
    }

    fun stop() {
        cancel?.cancel()
        cancel = null
    }

    private companion object {
        const val TAG = "UmbraGoogle"
    }
}
