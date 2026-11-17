using UnityEngine;

namespace CornholeThrowdown
{
    // Court layout helpers. Court 1 is the Backyard BBQ (BackyardScene.cs).
    // Boards face each other 27 ft apart (front edge to front edge), along +z.
    public static class Court
    {
        public const float M = Board.M;

        // Court units are feet (as in the engine); Unity is metres with +z down-range.
        public static Vector3 U(double x, double y, double z) => new Vector3((float)x, (float)z, (float)y) * M;

        public static void BuildBackyard()
        {
            // Boards: the target 27 ft away, and the thrower's own board (facing it) at the near end.
            Board.Build("Target board", U(0, Eng.FY, 0), 0f);
            Board.Build("Own board", Vector3.zero, 180f);
            BackyardScene.Build();
        }
    }
}
