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
                        + "   public Double add() {\n"
                        + "      return 2.0;\n"
                        + "   }\n"
                        + "} \n",
                "SingPath sp = new SingPath();\n"
                        + "assertEquals(2.0, 2.0);"
        );
        Response resp = Verifier.process(req);

        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
        boolean solved = (boolean) dict.get("solved");

        assertEquals(true, solved);
    }

//    @Test
//    public void testProcessVarArgs() throws Exception {
//        Request req = new Request(
//                "import java.util.*;\n" +
//                        "import java.util.stream.*;\n" +
//                        "\n" +
//                        "public class SingPath {\n" +
//                        "   public long add() {\n" +
//                        "     long count = Arrays.asList(1,2,3).stream().count();\n" +
//                        "     return count;\n" +
//                        "   }\n" +
//                        "} \n",
//                "SingPath sp = new SingPath();\n"
//                        + "assertEquals(3, sp.add());"
//        );
//        Response resp = Verifier.process(req);
//
//        JSONObject dict = (JSONObject) JSONValue.parse(resp.toString());
//        boolean solved = (boolean) dict.get("solved");
//
//        assertEquals(true, solved);
//    }
}