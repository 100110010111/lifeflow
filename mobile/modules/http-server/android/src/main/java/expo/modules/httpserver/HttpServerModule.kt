package expo.modules.httpserver

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
            return@AsyncFunction true
        }

        AsyncFunction("stop") {
            server?.stop()
            server = null
            feeds.clear()
            audioUrls.clear()
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
