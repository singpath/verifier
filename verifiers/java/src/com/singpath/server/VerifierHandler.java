package com.singpath.server;

import com.singpath.Request;
import com.singpath.Response;
import com.singpath.Verifier;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.IOException;
import java.io.OutputStream;


public class VerifierHandler implements HttpHandler {

    public static final String errInternalError = "Internal server error";
    private static final Logger logger = LogManager.getLogger(VerifierHandler.class);

    public void handle(HttpExchange t) throws IOException {
        Response resp = this.processReq(t);
        String json = resp.toString();

        Headers headers = t.getResponseHeaders();
        headers.add("Content-Type", "application/json");
        headers.add("Access-Control-Allow-Origin", "*");
        t.sendResponseHeaders(200, json.length());
        OutputStream os = t.getResponseBody();
        os.write(json.getBytes());
        os.close();
    }

    private Request getRequest(HttpExchange t) {
        try {
            Object body = JSONValue.parse(t.getRequestBody());
            JSONObject dict = (JSONObject) body;

            String solution = (String) dict.get("solution");
            String tests = (String) dict.get("tests");
            return new Request(solution, tests);
        } catch (ClassCastException e) {
            logger.error("Invalid request body");
            return new Request(null, null);
        }
    }

    private Response processReq(HttpExchange t) {
        try {
            return Verifier.process(this.getRequest(t));
        } catch (Exception e) {
            logger.error(e.toString());
            return new Response(VerifierHandler.errInternalError);
        }
    }
}