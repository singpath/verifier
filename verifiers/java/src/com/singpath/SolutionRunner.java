package com.singpath;

import com.singpath.tools.Compiler;
import com.singpath.tools.StringJavaSource;
import junit.framework.TestCase;
import org.junit.runner.JUnitCore;
import org.junit.runner.Result;

import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintStream;
import java.nio.charset.Charset;

public class SolutionRunner extends TestCase {
    public static final String SOLUTION_CLASS_NAME = "SingPath";
    public static final String TEST_CLASS_NAME = "SingPathTest";

    public static String errCompileError = "Internal error";

    public static Response runRequest(Request req) {
        Compiler compiler = new Compiler();
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        boolean success = compiler.compile(
                new BufferedWriter(new OutputStreamWriter(out)),
                new StringJavaSource(SOLUTION_CLASS_NAME, req.getSolution()),
                new StringJavaSource(TEST_CLASS_NAME, req.getTests())
        );

        if (!success) {
            return new Response(new String(out.toByteArray(), Charset.forName("UTF-8")));
        }

        PrintStream oldOut = System.out;
        PrintStream oldErr = System.err;

        try {
            ByteArrayOutputStream pipeOut = new ByteArrayOutputStream();
            ByteArrayOutputStream pipeErr = new ByteArrayOutputStream();

            System.setOut(new PrintStream(pipeOut));
            System.setErr(new PrintStream(pipeErr));

            Class<?> k = compiler.find(TEST_CLASS_NAME);
            Result result = JUnitCore.runClasses(k);

            System.setOut(oldOut);
            System.setErr(oldErr);

            return new Response(result);
        } catch (ClassNotFoundException e) {
            System.setOut(oldOut);
            System.setErr(oldErr);

            e.printStackTrace();
            return new Response(errCompileError);
        }
    }

}
