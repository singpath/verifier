package com.singpath;

import java.util.concurrent.*;


public class Verifier implements Callable<Response> {

    public static final int TIMEOUT = Integer.getInteger("com.singpath.verifier.timeout", 5000);

    public static final String errTooLong = "Your code took too long to return. Your solution may be stuck in an infinite loop.";
    public static final String errInvalidRequest = "No solution or tests defined.";
    private Request req;

    public Verifier(Request req) {
        super();
        this.req = req;
    }

    public static Response process(Request req) {
        ExecutorService executor = Executors.newSingleThreadExecutor();

        try {
            Future<Response> f = executor.submit(new Verifier(req));
            return f.get(TIMEOUT, TimeUnit.SECONDS);
        } catch (InterruptedException | TimeoutException | ExecutionException e) {
            return new Response(Verifier.errTooLong);
        } finally {
            executor.shutdown();
        }
    }

    @Override
    public Response call() throws Exception {
        if (!this.req.isValid()) {
            return new Response(errInvalidRequest);
        }

        return SolutionRunner.runRequest(req);
    }
}
