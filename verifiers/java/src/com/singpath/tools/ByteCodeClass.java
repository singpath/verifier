package com.singpath.tools;

import javax.tools.SimpleJavaFileObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;

public class ByteCodeClass extends SimpleJavaFileObject {
    private ByteArrayOutputStream baos = new ByteArrayOutputStream();

    public ByteCodeClass(String name) {
        super(URI.create("byte:///" + name + ".class"), Kind.CLASS);
    }

    public CharSequence getCharContent(boolean ignoreEncodingErrors) {
        throw new IllegalStateException();
    }

    public OutputStream openOutputStream() {
        return baos;
    }

    public InputStream openInputStream() {
        throw new IllegalStateException();
    }

    public byte[] getBytes() {
        return baos.toByteArray();
    }
}
