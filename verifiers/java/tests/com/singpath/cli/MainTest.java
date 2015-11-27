package com.singpath.cli;

import com.singpath.Response;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.junit.Test;

import static org.junit.Assert.assertEquals;


public class MainTest {

    @Test
    public void testProcessYaml() throws Exception {
        String pauload = "---\n"
                + "solution: |\n"
                + "  public class SingPath {\n"
                + "     public Double add() {\n"
                + "        return 2.0;\n"
                + "     }\n"
                + "  } \n"
                + "tests: |\n"
                + "  SingPath sp = new SingPath();\n"
                + "  assertEquals(2.0, 2.0);\n";

        Response resp = Main.processReq(pauload);
        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }

    @Test
    public void testProcessJSON() throws Exception {
        String pauload = "{"
                + "\"solution\": "
                + "  \"public class SingPath {\\n"
                + "     public Double add() {\\n"
                + "        return 2.0;\\n"
                + "     }\\n"
                + "  }\","
                + "\"tests\": "
                + "\"SingPath sp = new SingPath();\\n"
                + "assertEquals(2.0, 2.0);\\n\""
                + "}";

        Response resp = Main.processReq(pauload);
        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }
}