import csv


def export_data(iterations, all_gaps, all_row_counts, all_col_counts, game_matrices, filepath, seed):
    file_ext = filepath.split('.')[-1].lower()
    
    if file_ext == 'csv':
        _export_csv(iterations, all_gaps, all_row_counts, all_col_counts, filepath, seed)
    elif file_ext == 'md':
        _export_markdown(iterations, all_gaps, all_row_counts, all_col_counts, game_matrices, filepath, seed)
    else:
        print(f"Unsupported format: {file_ext}. Use .csv or .md")


def _export_csv(iterations, all_gaps, all_row_counts, all_col_counts, filepath, seed):
    with open(filepath, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['# Fictitious Play Simulation Data'])
        writer.writerow([f'# Seed: {seed}'])
        writer.writerow([f'# Total Iterations: {len(iterations)}'])
        writer.writerow([f'# Number of Games: {len(all_gaps)}'])
        writer.writerow([])
        writer.writerow(['Game', 'Iteration', 'Gap', 'Row Strategy', 'Column Strategy'])
        
        for game_idx in range(len(all_gaps)):
            for iter_idx, t in enumerate(iterations):
                gap = all_gaps[game_idx][iter_idx]
                
                if iter_idx < len(all_row_counts[game_idx]):
                    row_counts = all_row_counts[game_idx][iter_idx]
                    col_counts = all_col_counts[game_idx][iter_idx]
                    row_strategy = row_counts / t
                    col_strategy = col_counts / t
                    
                    row_str = ';'.join([f"{x:.6f}" for x in row_strategy])
                    col_str = ';'.join([f"{x:.6f}" for x in col_strategy])
                else:
                    row_str = ''
                    col_str = ''
                
                writer.writerow([game_idx + 1, t, f"{gap:.6e}", row_str, col_str])
    
    print(f"Data exported to: {filepath}")


def _export_markdown(iterations, all_gaps, all_row_counts, all_col_counts, game_matrices, filepath, seed):
    with open(filepath, 'w') as f:
        f.write(f"# Fictitious Play Simulation Data\n\n")
        f.write(f"**Seed:** {seed}\n\n")
        f.write(f"**Total Iterations:** {len(iterations):,}\n\n")
        f.write(f"**Number of Games:** {len(all_gaps)}\n\n")
        
        for game_idx in range(len(all_gaps)):
            matrix = game_matrices[game_idx]
            f.write(f"## Game {game_idx + 1}\n\n")
            f.write(f"**Matrix Size:** {matrix.shape[0]}×{matrix.shape[1]}\n\n")
            f.write("| Iteration | Gap | Row Strategy (first 5) | Column Strategy (first 5) |\n")
            f.write("|-----------|-----|------------------------|---------------------------|\n")
            
            sample_rate = max(1, len(iterations) // 100)
            for iter_idx in range(0, len(iterations), sample_rate):
                t = iterations[iter_idx]
                gap = all_gaps[game_idx][iter_idx]
                
                if iter_idx < len(all_row_counts[game_idx]):
                    row_counts = all_row_counts[game_idx][iter_idx]
                    col_counts = all_col_counts[game_idx][iter_idx]
                    row_strategy = row_counts / t
                    col_strategy = col_counts / t
                    
                    row_str = ', '.join([f"{x:.4f}" for x in row_strategy[:5]])
                    col_str = ', '.join([f"{x:.4f}" for x in col_strategy[:5]])
                    if len(row_strategy) > 5:
                        row_str += "..."
                    if len(col_strategy) > 5:
                        col_str += "..."
                else:
                    row_str = ''
                    col_str = ''
                
                f.write(f"| {t:,} | {gap:.6e} | {row_str} | {col_str} |\n")
            
            f.write("\n")
    
    print(f"Data exported to: {filepath}")
