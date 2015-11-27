package com.singpath;

import com.singpath.tools.Compiler;
import com.singpath.tools.StringJavaSource;
import junit.framework.TestCase;
import org.junit.runner.JUnitCore;
import org.junit.runner.Result;

import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.Charset;

public class SolutionRunner extends TestCase {
    public static final String SOLUTION_CLASS_NAME = "SingPath";
    public static final String TEST_CLASS_NAME = "SingPathTest";
    public static final String TEST_TEMPLATE = "import org.junit.Test;\n" +
            "import static org.junit.Assert.*;\n" +
            "import junit.framework.*;\n" +
            "import com.singpath.SolutionRunner;\n" +
            "\n" +
            "public class SingPathTest extends SolutionRunner {\n" +
            "\n" +
            "    @Test\n" +
            "    public void testSolution() throws Exception {\n" +
            "        %s\n" +
            "    }\n" +
            "}";
    public static String errCompileError = "Internal error";

    public static Response runRequest(Request req) {
        Compiler compiler = new Compiler();
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        boolean success = compiler.compile(
                new BufferedWriter(new OutputStreamWriter(out)),
                new StringJavaSource(SOLUTION_CLASS_NAME, req.getSolution()),
                new StringJavaSource(TEST_CLASS_NAME, String.format(TEST_TEMPLATE, req.getTests()))
        );

        if (!success) {
            return new Response(new String(out.toByteArray(), Charset.forName("UTF-8")));
        }

        try {
            Class<?> k = compiler.find(TEST_CLASS_NAME);
            Result result = JUnitCore.runClasses(k);
            return new Response(result);
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
            return new Response(errCompileError);
        }
    }

}
