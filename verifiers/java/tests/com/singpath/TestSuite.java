package com.singpath;

import com.singpath.cli.MainTest;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
        MainTest.class,
        RequestTest.class,
        ResponseTest.class,
        VerifierTest.class
})
public class TestSuite {
}
