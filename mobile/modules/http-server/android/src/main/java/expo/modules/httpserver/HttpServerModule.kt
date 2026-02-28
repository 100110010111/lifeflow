package expo.modules.httpserver

import android.os.Bundle
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import fi.iki.elonen.NanoHTTPD
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

data class PendingResponse(
    val statusCode: Int,
    val contentType: String,
    val body: String,
    val headers: Map<String, String>
)

class HttpServerModule : Module() {
    private var server: LifeFlowServer? = null
    private val pendingRequests = ConcurrentHashMap<String, CompletableFuture<PendingResponse>>()

    override fun definition() = ModuleDefinition {
        Name("HttpServer")

        Events("onRequest")

        AsyncFunction("start") { port: Int ->
            if (server != null) {
                server?.stop()
            }
            server = LifeFlowServer(port, this@HttpServerModule)
            server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            return@AsyncFunction true
        }

        AsyncFunction("stop") {
            server?.stop()
            server = null
            // Cancel all pending requests
            pendingRequests.values.forEach {
                it.complete(PendingResponse(503, "text/plain", "Server stopping", emptyMap()))
            }
            pendingRequests.clear()
            return@AsyncFunction true
        }

        Function("respond") { requestId: String, statusCode: Int, contentType: String, body: String, locationHeader: String? ->
            val headers = mutableMapOf<String, String>()
            if (locationHeader != null) {
                headers["Location"] = locationHeader
            }
            pendingRequests[requestId]?.complete(
                PendingResponse(statusCode, contentType, body, headers)
            )
        }

        Function("isRunning") {
            return@Function server?.isAlive == true
        }
    }

    fun handleRequest(uri: String, method: String, queryString: String?): PendingResponse {
        val requestId = UUID.randomUUID().toString()
        val future = CompletableFuture<PendingResponse>()
        pendingRequests[requestId] = future

        sendEvent("onRequest", bundleOf(
            "requestId" to requestId,
            "uri" to uri,
            "method" to method,
            "query" to (queryString ?: "")
        ))

        return try {
            future.get(30, TimeUnit.SECONDS)
        } catch (e: Exception) {
            PendingResponse(504, "text/plain", "Request timeout", emptyMap())
        } finally {
            pendingRequests.remove(requestId)
        }
    }

    inner class LifeFlowServer(port: Int, private val module: HttpServerModule) : NanoHTTPD(port) {
        override fun serve(session: IHTTPSession): Response {
            val result = module.handleRequest(
                session.uri,
                session.method.name,
                session.queryParameterString
            )

            val response = newFixedLengthResponse(
                Response.Status.lookup(result.statusCode) ?: Response.Status.INTERNAL_ERROR,
                result.contentType,
                result.body
            )

            for ((key, value) in result.headers) {
                response.addHeader(key, value)
            }

            return response
        }
    }
}
