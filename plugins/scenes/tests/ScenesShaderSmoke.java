import android.graphics.RuntimeShader;
import android.graphics.RenderEffect;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Shader;
import java.nio.file.Files;
import java.nio.file.Path;

/** Compile the shipping source and bind every scene on a real Android runtime. */
public class ScenesShaderSmoke {
    public static void main(String[] args) throws Exception {
        String file = Files.readString(Path.of(args[0]));
        int start = file.indexOf("\"\"\"") + 3;
        RuntimeShader shader = new RuntimeShader(file.substring(start, file.indexOf("\"\"\"", start)));
        // Software rasterization is optional: some Android builds terminate app_process
        // when it attempts to render RuntimeShader into a software bitmap.
        boolean render = args.length > 1 && args[1].equals("--render");
        if (!render) {
            shader.setFloatUniform("size", 1260f, 2800f);
            shader.setFloatUniform("density", 3f);
            shader.setFloatUniform("time", 4f);
            shader.setFloatUniform("strength", .65f);
            for (int scene = 0; scene < 9; scene++) {
                shader.setFloatUniform("scene", (float) scene);
                RenderEffect.createRuntimeShaderEffect(shader, "img");
                System.out.println("PASS atmosphere " + scene);
            }
            return;
        }
        int width = 240, height = 480;
        Bitmap input = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        input.eraseColor(Color.rgb(30, 32, 38));
        Canvas background = new Canvas(input);
        Paint text = new Paint();
        text.setColor(Color.rgb(235, 235, 240));
        for (int y = 60; y < height; y += 40) background.drawRect(30, y, 180, y + 4, text);
        Bitmap first = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Bitmap later = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint();
        paint.setShader(shader);
        shader.setInputShader("img", new BitmapShader(input, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        shader.setFloatUniform("size", (float) width, (float) height);
        shader.setFloatUniform("density", 1f);
        shader.setFloatUniform("time", 4f);
        shader.setFloatUniform("strength", .65f);
        for (int scene = 0; scene < 9; scene++) {
            shader.setFloatUniform("scene", (float) scene);
            RenderEffect.createRuntimeShaderEffect(shader, "img");
            shader.setFloatUniform("time", 4f);
            new Canvas(first).drawRect(0, 0, width, height, paint);
            shader.setFloatUniform("time", 9f);
            new Canvas(later).drawRect(0, 0, width, height, paint);
            int visible = 0, moving = 0;
            for (int y = 0; y < height; y += 2) for (int x = 0; x < width; x += 2) {
                int a = first.getPixel(x, y), b = later.getPixel(x, y), original = input.getPixel(x, y);
                if (difference(a, original) > 8) visible++;
                if (difference(a, b) > 2) moving++;
                if (Color.alpha(a) != 255) throw new AssertionError("Lost input opacity");
            }
            if (visible < 200 || moving < 40) throw new AssertionError("Invisible/static atmosphere " + scene + ": " + visible + "/" + moving);
            System.out.println("PASS atmosphere " + scene + " visible samples=" + visible + " animated samples=" + moving);
        }
    }
    private static int difference(int a, int b) {
        return Math.abs(Color.red(a)-Color.red(b)) + Math.abs(Color.green(a)-Color.green(b)) + Math.abs(Color.blue(a)-Color.blue(b));
    }
}
