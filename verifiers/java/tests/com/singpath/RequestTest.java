package com.singpath;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;


public class RequestTest {

    @Test
    public void testIsInValid() throws Exception {
        Request req = new Request("", "");
        assertFalse(req.isValid());
    }

    @Test
    public void testIsValid() throws Exception {
        Request req = new Request("foo", "bar");
        assertTrue(req.isValid());
    }

//    @Test
//    public void testCompile() throws Exception {
//        Request req = new Request(
//                "\n" +
//                        "public class SingPath {\n" +
//                        "    public int two = 2;\n" +
//                        "}",
//                "SingPath s = new SingPath();\n" +
//                        "assertEquals(2, s.two);"
//        );
//        assertTrue(req.compile(null));
//    }
}