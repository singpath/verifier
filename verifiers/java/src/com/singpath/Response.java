package com.singpath;

import net.minidev.json.JSONArray;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONStyle;
import org.junit.runner.Result;
import org.junit.runner.notification.Failure;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;


public class Response {

    private String errors;
    private Boolean solved;
    private JSONArray results;
    private String printed;
    private int runCount = -1;
    private long runTime = -1;

    public Response() {
        this(true);
    }

    public Response(Result result) {
        this(result.wasSuccessful());

        for (Failure f : result.getFailures()) {
            this.addResult(f.toString());
        }

        this.runCount = result.getRunCount();
        this.runTime = result.getRunTime();
    }

    public Response(boolean solved) {
        this.setSolved(solved);
    }

    public Response(String errors) {
        this.setErrors(errors);
    }

    public void setPrinted(ByteArrayOutputStream out) {
        this.printed = new String(out.toByteArray(), Charset.forName("UTF-8"));
    }

    public void addResult(String call) {
        if (this.results == null) {
            this.results = new JSONArray();
        }

        JSONObject result = new JSONObject();
        result.put("call", call);
        result.put("correct", false);
        this.results.add(result);
    }

    public void setSolved(Boolean solved) {
        this.solved = solved;
    }

    public void setErrors(String errors) {
        this.solved = false;
        this.errors = errors;
    }

    @Override
    public String toString() {
        JSONObject json = new JSONObject();

        json.put("solved", this.solved);

        if (this.errors != null) {
            json.put("errors", this.errors);
        }

        if (this.results != null && this.results.size() > 0) {
            json.put("results", this.results);
        }

        if (this.runTime != -1) {
            json.put("runTime", this.runTime);
        }

        if (this.runCount != -1) {
            json.put("runTime", this.runCount);
        }

        if (this.printed != null && this.printed.length() > 0) {
            json.put("printed", this.printed);
        }

        return json.toString(JSONStyle.NO_COMPRESS);
    }
}
