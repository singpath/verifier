package com.singpath.cli;

import com.singpath.Request;
import com.singpath.Response;
import com.singpath.Verifier;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.scanner.ScannerException;

import java.util.Map;
import java.util.logging.Logger;

public class Main {
    private static final Logger logger = Logger.getLogger(Main.class.getName());

    private static final String ERR_NO_SOLUTION = "No solution to verify.";
    private static final String ERR_TWO_MANY_SOLUTIONS = "I can only verify one solution at a time.";
    private static final String ERR_INTERNAL_ERROR = "Internal error";

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            Main.logger.severe(ERR_NO_SOLUTION);
            System.exit(128);
        }

        if (args.length > 1) {
            Main.logger.severe(ERR_TWO_MANY_SOLUTIONS);
            System.exit(129);
        }

        String payload = args[args.length - 1];
        Response resp = Main.processReq(payload);
        System.out.println(resp.toString());
    }

    private static Request getRequestFromJSON(String payload) {
        Object body = JSONValue.parse(payload);
        JSONObject dict = (JSONObject) body;

        String solution = (String) dict.get("solution");
        String tests = (String) dict.get("tests");
        return new Request(solution, tests);
    }

    private static Request getRequestFromYAML(String payload) {
        Yaml yaml = new Yaml();

        Map map = (Map) yaml.load(payload);
        String solution = (String) map.get("solution");
        String tests = (String) map.get("tests");
        return new Request(solution, tests);
    }

    protected static Response processReq(String payload) {
        Request req;

        try {
            if (payload.trim().startsWith("---")) {
                req = Main.getRequestFromYAML(payload);
            } else {
                req = Main.getRequestFromJSON(payload);
            }
        } catch (ClassCastException|NullPointerException|ScannerException e) {
            logger.severe(e.toString());
            return new Response(ERR_INTERNAL_ERROR);
        }

        try {
            return Verifier.process(req);
        } catch (Exception e) {
            logger.severe(e.toString());
            return new Response(ERR_INTERNAL_ERROR);
        }
    }
}
