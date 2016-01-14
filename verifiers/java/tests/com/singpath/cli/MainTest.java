package com.singpath.cli;

import com.singpath.Response;
import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.junit.Test;

import static org.junit.Assert.assertEquals;


public class MainTest {

    @Test
    public void testProcessYaml() throws Exception {
        String payload = "---\n"
            + "tests: |\n"
            + "  import org.junit.Test;\n"
            + "  import static org.junit.Assert.*;\n"
            + "  import junit.framework.*;\n"
            + "  import com.singpath.SolutionRunner;\n"
            + "  \n"
            + "  public class SingPathTest extends SolutionRunner {\n"
            + "    @Test\n"
            + "    public void testCapitalize() throws Exception {\n"
            + "      SingPath sp = new SingPath();\n"
            + "      assertEquals(2.0, sp.add());\n"
            + "    }\n"
            + "  }\n"
            + "solution: |\n"
            + "  public class SingPath {\n"
            + "    public Double add() {\n"
            + "      return 2.0;\n"
            + "    }\n"
            + "  }\n";

        Response resp = Main.processReq(payload);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }

    @Test
    public void testProcessJSON() throws Exception {
        String payload = "{\n"
            + "  \"tests\": \"import org.junit.Test;\\nimport static org.junit.Assert.*;\\nimport junit.framework.*;\\nimport com.singpath.SolutionRunner;\\n\\npublic class SingPathTest extends SolutionRunner {\\n  @Test\\n  public void testCapitalize() throws Exception {\\n    SingPath sp = new SingPath();\\n    assertEquals(2.0, sp.add());\\n  }\\n}\n\","
            + "  \"solution\": \"public class SingPath {\\n  public Double add() {\\n    return 2.0;\\n  }\\n}\\n\"\n"
            + "}";

        Response resp = Main.processReq(payload);
        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }
}