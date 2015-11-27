package com.singpath.server;

import com.sun.net.httpserver.HttpServer;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.net.InetSocketAddress;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Main implements Runnable, ShutDown {

    private final static int PORT = Integer.getInteger("com.singpath.server.port", 5000);
    private final static String CONTEXT = System.getProperty("com.singpath.server.java.context", "/java");
    private final static int POOLSIZE = Integer.getInteger("com.singpath.server.poolSize", 3);

    private static final Logger logger = LogManager.getLogger(VerifierHandler.class);

    private HttpServer server;

    public static void main(String[] args) throws Exception {
        Main s = new Main();
        Thread t = new Thread(s);

        t.start();

        Runtime.getRuntime().addShutdownHook(new Thread(new OnShutDown(s)));
    }

    @Override
    public void run() {
        try {
            ExecutorService executor = Executors.newFixedThreadPool(POOLSIZE);

            this.server = HttpServer.create(new InetSocketAddress(PORT), 0);
            this.server.createContext(CONTEXT, new VerifierHandler());
            this.server.setExecutor(executor); // creates a default executor
            this.server.start();

            logger.info("Started Verifier server started.");
            logger.info("Listening on port:" + PORT);
            logger.info("Pool size: " + POOLSIZE);
            logger.info("BeanShell (Java) verification handled at:" + CONTEXT);

            // Wait here until notified of shutdown.
            synchronized (this) {
                try {
                    this.wait();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void shutdown() {
        try {
            logger.info("Shutting down TestServer.");
            this.server.stop(0);
        } catch (Exception e) {
            e.printStackTrace();
        }

        synchronized (this) {
            this.notifyAll();
        }

    }
}