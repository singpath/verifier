package com.singpath;

import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class ResponseTest {

    @Test
    public void testSetSolvedFalse() throws Exception {
        Response resp = new Response();
        resp.setSolved(false);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(false, solved);
    }

    @Test
    public void testSetSolvedTrue() throws Exception {
        Response resp = new Response();
        resp.setSolved(true);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }

    @Test
    public void testSetErrors() throws Exception {
        Response resp = new Response();
        resp.setErrors("You're bad.");

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");
        String error = (String) dict.get("errors");

        assertEquals(false, solved);
        assertEquals("You're bad.", error);
    }

    @Test
    public void testSetOutputStream() throws Exception {
        Response resp = new Response();

        JSONObject before = (JSONObject) JSONValue.parse(resp.toString());
        String noOutput = (String) before.get("printed");

        assertNull(noOutput);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PrintStream s = new PrintStream(out);
        s.print("some output");

        resp.setPrinted(out);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        String printed = (String) dict.get("printed");

        assertEquals("some output", printed);
    }
}