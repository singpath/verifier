package com.singpath;

import net.minidev.json.JSONObject;
import net.minidev.json.JSONValue;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class VerifierTest {

    @Test
    public void testProcess() throws Exception {
        Request req = new Request(
                "\n"
                        + "public class SingPath {\n"
                        + "  public Double add() {\n"
                        + "    return 2.0;\n"
                        + "  }\n"
                        + "} \n",
                 "import org.junit.Test;\n"
                        + "import static org.junit.Assert.*;\n"
                        + "import junit.framework.*;\n"
                        + "import com.singpath.SolutionRunner;\n"
                        + "\n"
                        + "public class SingPathTest extends SolutionRunner {\n"
                        + "\n"
                        + "  @Test\n"
                        + "  public void testSolution() throws Exception {\n"
                        + "    SingPath sp = new SingPath();\n"
                        + "    assertEquals(2.0, 2.0);\n"
                        + "  }\n"
                        + "}"
        );
        Response resp = Verifier.process(req);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }
}