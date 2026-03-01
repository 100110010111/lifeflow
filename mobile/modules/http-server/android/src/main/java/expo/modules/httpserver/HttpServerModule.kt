package expo.modules.httpserver

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import fi.iki.elonen.NanoHTTPD
import java.util.concurrent.ConcurrentHashMap

class HttpServerModule : Module() {
    private var server: LifeFlowServer? = null
    private val feeds = ConcurrentHashMap<String, String>()
    private val audioUrls = ConcurrentHashMap<String, String>()

    override fun definition() = ModuleDefinition {
        Name("HttpServer")

        AsyncFunction("start") { port: Int ->
            server?.stop()
            server = LifeFlowServer(port)
            server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)

            // Start foreground service to keep alive in background
            try {
                val context = appContext.reactContext ?: return@AsyncFunction true
                val intent = Intent(context, FeedServerService::class.java)
                intent.putExtra("statusText", "Serving podcast feeds on localhost:$port")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // If foreground service fails, server still runs (just won't survive background)
                android.util.Log.w("HttpServer", "Foreground service failed: ${e.message}")
            }

            return@AsyncFunction true
        }

        AsyncFunction("stop") {
            server?.stop()
            server = null
            feeds.clear()
            audioUrls.clear()

            // Stop foreground service
            try {
                val context = appContext.reactContext ?: return@AsyncFunction true
                context.stopService(Intent(context, FeedServerService::class.java))
            } catch (e: Exception) {
                android.util.Log.w("HttpServer", "Stop service failed: ${e.message}")
            }

            return@AsyncFunction true
        }

        Function("setFeed") { podcastId: String, xml: String ->
            feeds[podcastId] = xml
        }

        Function("setAudioUrl") { mediaId: String, url: String ->
            audioUrls[mediaId] = url
        }

        Function("clearFeeds") {
            feeds.clear()
        }

        Function("clearAudioUrls") {
            audioUrls.clear()
        }

        Function("isRunning") {
            return@Function server?.isAlive == true
        }

        Function("diagnostics") {
            return@Function "feeds=${feeds.size}, audioUrls=${audioUrls.size}, running=${server?.isAlive == true}"
        }
    }

    inner class LifeFlowServer(port: Int) : NanoHTTPD(port) {
        override fun serve(session: IHTTPSession): Response {
            val uri = session.uri ?: ""

            // Route: /feed/:podcastId
            val feedMatch = Regex("^/feed/([a-zA-Z0-9_-]+)$").find(uri)
            if (feedMatch != null) {
                val podcastId = feedMatch.groupValues[1]
                val xml = feeds[podcastId]
                return if (xml != null) {
                    newFixedLengthResponse(Response.Status.OK, "application/rss+xml; charset=utf-8", xml)
                } else {
                    newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Feed not found: $podcastId")
                }
            }

            // Route: /audio/:mediaId
            val audioMatch = Regex("^/audio/([a-zA-Z0-9_-]+)$").find(uri)
            if (audioMatch != null) {
                val mediaId = audioMatch.groupValues[1]
                val url = audioUrls[mediaId]
                return if (url != null) {
                    val response = newFixedLengthResponse(Response.Status.REDIRECT, "text/plain", "")
                    response.addHeader("Location", url)
                    response
                } else {
                    newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Audio not found: $mediaId")
                }
            }

            // Route: / — health check
            if (uri == "/" || uri.isEmpty()) {
                return newFixedLengthResponse(
                    Response.Status.OK,
                    "text/plain",
                    "LifeFlow Bridge running. Feeds: ${feeds.size}, Audio URLs: ${audioUrls.size}"
                )
            }

            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found: $uri")
        }
    }
}
