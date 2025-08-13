// Configuración de Supabase y funciones para la aplicación de evaluación de catedráticos

// Configuración de Supabase usando variables de entorno con fallback
const SUPABASE_URL = 'https://onncrefefsvdmpxthxtw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubmNyZWZlZnN2ZG1weHRoeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0Mjk5MDksImV4cCI6MjA3MDAwNTkwOX0.UEmH6tAFz4SmS1dtJS0fYq0V0bXC_ixZspy08Dx-xZ8';

// Inicializar cliente de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==== AUTENTICACIÓN ====

// Iniciar sesión con email y contraseña
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  await saveSessionToStorage(data.session);
  return data.user;
}

// Registrar nuevo usuario
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });
  
  if (error) throw error;
  if (data.session) await saveSessionToStorage(data.session);
  return data.user;
}

// Cerrar sesión
async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  sessionStorage.removeItem('supabase.auth.token');
  localStorage.removeItem('supabase.auth.token');
  return true;
}

// Obtener el usuario actual
async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user;
}

// Verificar si el usuario está autenticado
async function isAuthenticated() {
  const user = await getCurrentUser();
  return user !== null;
}

// Almacenar sesión para persistencia
async function saveSessionToStorage(session) {
  if (session) {
    localStorage.setItem('supabase.auth.token', JSON.stringify(session));
  }
}

// ==== MANEJO DE DATOS DE CATEDRÁTICOS ====

// Obtener todos los catedráticos
async function getProfessors() {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// Obtener un catedrático por ID
async function getProfessorById(id) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(*),
      comments(
        *,
        comment_likes(id)
      )
    `)
    .eq('id', id)
    .single();
  
  if (error) throw error;
  
  // Recalcular el rating basado en las evaluaciones actuales
  if (data && data.ratings && data.ratings.length > 0) {
    const averageRating = data.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / data.ratings.length;
    data.rating = parseFloat(averageRating.toFixed(1));
  } else {
    data.rating = 0;
  }
  
  // Agregar conteo de likes a cada comentario y ordenar por likes
  if (data && data.comments) {
    data.comments = data.comments.map(comment => {
      comment.likes_count = comment.comment_likes?.length || 0;
      return comment;
    }).sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)); // Ordenar por likes descendente
  }
  
  return data;
}

// Obtener los catedráticos mejor evaluados
async function getTopRatedProfessors(limit = 5) {
  // Obtener TODOS los profesores con sus ratings para recalcular correctamente
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings para cada profesor
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  // Filtrar solo los que tienen evaluaciones (rating > 0) y ordenar por rating actualizado
  const topRated = professorsWithUpdatedRatings
    .filter(prof => prof.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
    
  console.log('Top rated professors recalculados:', topRated.map(p => ({
    name: p.name,
    rating: p.rating,
    evaluationsCount: p.ratings?.length || 0
  })));
  
  return topRated;
}

// Buscar catedráticos por nombre
async function searchProfessors(query) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `)
    .ilike('name', `%${query}%`);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// ==== MANEJO DE EVALUACIONES ====

// Enviar una nueva evaluación
async function submitEvaluation(professorId, evaluation) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { dominio, metodologia, puntualidad, comments } = evaluation;
  
  // Calcular el rating promedio
  const averageRating = ((dominio + metodologia + puntualidad) / 3).toFixed(1);
  
  console.log('Enviando evaluación:', {
    professorId,
    dominio,
    metodologia, 
    puntualidad,
    averageRating,
    comments
  });
  
  // 1. Guardar la evaluación en la tabla 'ratings'
  const { data: ratingData, error: ratingError } = await supabaseClient
    .from('ratings')
    .insert({
      professor_id: professorId,
      user_id: user.id,
      dominio,
      metodologia,
      puntualidad,
      average: averageRating
    })
    .select();
    
  if (ratingError) {
    console.error('Error al guardar rating:', ratingError);
    throw ratingError;
  }
  
  console.log('Rating guardado exitosamente:', ratingData);
  
  // 2. Guardar el comentario si existe
  if (comments && comments.trim() !== '') {
    const { data: commentData, error: commentError } = await supabaseClient
      .from('comments')
      .insert({
        professor_id: professorId,
        user_id: user.id,
        text: comments,
        date: new Date().toISOString().split('T')[0]
      })
      .select();
      
    if (commentError) {
      console.error('Error al guardar comentario:', commentError);
      throw commentError;
    }
    
    console.log('Comentario guardado exitosamente:', commentData);
  }
  
  // 3. Actualizar el rating promedio del catedrático
  const newAverage = await updateProfessorRating(professorId);
  console.log('Rating del profesor actualizado:', newAverage);
  
  return true;
}

// Actualizar el rating promedio de un catedrático
async function updateProfessorRating(professorId) {
  // Obtener todas las evaluaciones del profesor
  const { data, error } = await supabaseClient
    .from('ratings')
    .select('average')
    .eq('professor_id', professorId);
    
  if (error) throw error;
  
  if (data && data.length > 0) {
    // Calcular el promedio
    const ratings = data.map(r => parseFloat(r.average));
    const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    
    // Actualizar el catedrático
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: parseFloat(averageRating.toFixed(1)) })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`Rating actualizado para profesor ${professorId}: ${averageRating.toFixed(1)}`);
    return averageRating;
  } else {
    // Si no hay evaluaciones, mantener rating en 0
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: 0 })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`No hay evaluaciones para profesor ${professorId}, rating mantenido en 0`);
    return 0;
  }
}

// Verificar si un usuario ya evaluó a un catedrático
async function hasUserEvaluatedProfessor(professorId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('ratings')
    .select('id')
    .eq('professor_id', professorId)
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (error) throw error;
  return data !== null;
}

// Obtener evaluaciones realizadas por el usuario actual con detalles del profesor
async function getUserEvaluations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('ratings')
    .select(`
      *,
      professors(id, name, courses, avatar, rating)
    `)
    .eq('user_id', user.id)
    .order('average', { ascending: false }); // Ordenar por rating descendente
    
  if (error) throw error;
  return data;
}

// Obtener comentarios realizados por el usuario actual
async function getUserComments() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(id, name, courses, avatar)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  return data;
}

// Obtener todos los comentarios de todos los usuarios con información del profesor
async function getAllCommentsWithProfessors() {
  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(
        id, 
        name, 
        courses, 
        avatar, 
        rating,
        ratings(dominio, metodologia, puntualidad, average)
      ),
      comment_likes(id)
    `)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  
  // Agrupar por profesor y ordenar profesores por rating
  const professorComments = {};
  
  data.forEach(comment => {
    const profId = comment.professor_id;
    if (!professorComments[profId]) {
      professorComments[profId] = {
        professor: comment.professors,
        comments: []
      };
    }
    
    // Agregar conteo de likes al comentario
    comment.likes_count = comment.comment_likes?.length || 0;
    
    professorComments[profId].comments.push(comment);
  });
  
  // Ordenar comentarios de cada profesor por likes (mayor a menor)
  Object.values(professorComments).forEach(profData => {
    profData.comments.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  });
  
  // Convertir a array y ordenar profesores por rating
  const result = Object.values(professorComments).sort((a, b) => 
    (b.professor.rating || 0) - (a.professor.rating || 0)
  );
  
  return result;
}

// Dar like a un comentario
async function likeComment(commentId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .insert({
      comment_id: commentId,
      user_id: user.id
    })
    .select();
    
  if (error) {
    // Si ya existe el like, quitar el like (toggle)
    if (error.code === '23505') { // Unique constraint violation
      return await unlikeComment(commentId);
    }
    throw error;
  }
  
  return data;
}

// Quitar like de un comentario
async function unlikeComment(commentId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .select();
    
  if (error) throw error;
  return data;
}

// Verificar si el usuario ya dio like a un comentario
async function hasUserLikedComment(commentId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (error) throw error;
  return data !== null;
}

// Obtener likes de múltiples comentarios para el usuario actual
async function getUserLikesForComments(commentIds) {
  const user = await getCurrentUser();
  if (!user || !commentIds.length) return [];

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', user.id)
    .in('comment_id', commentIds);
    
  if (error) throw error;
  return data.map(like => like.comment_id);
}

// Agregar un nuevo catedrático (función anónima)
async function addProfessor(name, course) {
  // Generar avatar aleatorio con las iniciales del nombre
  const initials = name.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase();
  const colors = ['818cf8', 'f472b6', '34d399', 'f97316', '0ea5e9', '8b5cf6', '10b981', 'ef4444', '22c55e', '3b82f6'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const avatar = `https://placehold.co/64x64/${randomColor}/ffffff?text=${initials}`;
  
  const { data, error } = await supabaseClient
    .from('professors')
    .insert({
      name: name.trim(),
      courses: [course.trim()],
      avatar: avatar,
      rating: 0
    })
    .select();
    
  if (error) throw error;
  return data[0];
}

// Obtener un profesor aleatorio que el usuario no haya evaluado
async function getRandomUnevaluatedProfessor() {
  const user = await getCurrentUser();
  if (!user) {
    // Si no está autenticado, devolver un profesor completamente aleatorio
    const allProfessors = await getProfessors();
    if (allProfessors.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return allProfessors[randomIndex];
  }

  // Obtener todos los profesores
  const allProfessors = await getProfessors();
  
  // Obtener las evaluaciones del usuario
  const { data: userRatings, error } = await supabaseClient
    .from('ratings')
    .select('professor_id')
    .eq('user_id', user.id);
    
  if (error) throw error;
  
  const evaluatedIds = userRatings.map(rating => rating.professor_id);
  
  // Filtrar profesores no evaluados
  const unevaluatedProfessors = allProfessors.filter(prof => 
    !evaluatedIds.includes(prof.id)
  );
  
  console.log('Profesores disponibles:', allProfessors.length);
  console.log('Profesores ya evaluados:', evaluatedIds.length);
  console.log('Profesores sin evaluar:', unevaluatedProfessors.length);
  
  if (unevaluatedProfessors.length > 0) {
    // Hay profesores sin evaluar, devolver uno aleatorio
    const randomIndex = Math.floor(Math.random() * unevaluatedProfessors.length);
    return {
      professor: unevaluatedProfessors[randomIndex],
      canEvaluate: true,
      message: 'Evalúa a este catedrático'
    };
  } else {
    // Ya evaluó a todos, devolver uno aleatorio para ver comentarios
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return {
      professor: allProfessors[randomIndex],
      canEvaluate: false,
      message: 'Ya has evaluado a todos los catedráticos. Aquí puedes ver los comentarios de:'
    };
  }
}

// Función para sincronizar todos los ratings en la base de datos
async function syncAllProfessorRatings() {
  console.log('Sincronizando todos los ratings de profesores...');
  
  // Obtener todos los profesores
  const { data: professors, error: profError } = await supabaseClient
    .from('professors')
    .select('id, name');
    
  if (profError) throw profError;
  
  const updatePromises = professors.map(async (prof) => {
    await updateProfessorRating(prof.id);
  });
  
  await Promise.all(updatePromises);
  console.log('Sincronización completada para todos los profesores');
}

// ==== MANEJO DE RECURSOS PRO ====

// Obtener recursos de un profesor específico
async function getProfessorResources(professorId) {
  const { data, error } = await supabaseClient
    .from('recursos')
    .select(`
      *,
      professors(name)
    `)
    .eq('id_catedratico', professorId)
    .eq('status', 'aprobado')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  // Calcular rating promedio basado en votos
  const resourcesWithRatings = data.map(resource => {
    const totalVotes = resource.votos_positivos + resource.votos_negativos;
    if (totalVotes > 0) {
      const positiveRatio = resource.votos_positivos / totalVotes;
      resource.average_rating = parseFloat((positiveRatio * 5).toFixed(1));
    } else {
      resource.average_rating = 0;
    }
    resource.rating_count = totalVotes;
    return resource;
  });
  
  return resourcesWithRatings;
}

// Verificar si el usuario tiene suscripción PRO
async function hasProSubscription() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('es_pro')
    .eq('id', user.id)
    .maybeSingle();
    
  if (error) {
    console.error('Error verificando suscripción:', error);
    return false;
  }
  
  return data?.es_pro || false;
}

// Subir un nuevo recurso
async function uploadResource(professorId, file, resourceType, academicPeriod) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  // Simular subida de archivo (en producción usarías Supabase Storage)
  const fileName = `${Date.now()}_${file.name}`;
  const pathStorage = `recursos-pro/${fileName}`; // Path para el bucket
  
  const { data, error } = await supabaseClient
    .from('recursos')
    .insert({
      id_catedratico: professorId,
      id_usuario_que_subio: user.id,
      nombre_archivo: file.name,
      path_storage: pathStorage,
      tipo_recurso: resourceType,
      periodo_academico: academicPeriod,
      status: 'pendiente' // Requiere aprobación
    })
    .select();
    
  if (error) throw error;
  return data[0];
}

// Calificar un recurso con voto positivo/negativo (solo usuarios PRO)
async function rateResource(resourceId, isPositive) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');
  
  const isPro = await hasProSubscription();
  if (!isPro) throw new Error('Requiere suscripción PRO');

  // Incrementar voto correspondiente
  const columnToIncrement = isPositive ? 'votos_positivos' : 'votos_negativos';
  
  const { data, error } = await supabaseClient
    .rpc('incrementar_voto', {
      recurso_id: resourceId,
      columna: columnToIncrement
    });
    
  if (error) throw error;
  return data;
}

// Obtener estadísticas del usuario (puntos basados en recursos aprobados)
async function getUserStats() {
  const user = await getCurrentUser();
  if (!user) return { points: 0, uploaded_resources: 0, approved_resources: 0 };

  const { data, error } = await supabaseClient
    .from('recursos')
    .select('status')
    .eq('id_usuario_que_subio', user.id);
    
  if (error) {
    console.error('Error obteniendo estadísticas:', error);
    return { points: 0, uploaded_resources: 0, approved_resources: 0 };
  }
  
  const uploaded_resources = data.length;
  const approved_resources = data.filter(r => r.status === 'aprobado').length;
  const points = approved_resources * 100; // 100 puntos por recurso aprobado
  
  return { points, uploaded_resources, approved_resources };
}

// Obtener top contribuidores del mes
async function getTopContributors(limit = 10) {
  const { data, error } = await supabaseClient
    .rpc('get_top_contributors', { limite: limit });
    
  if (error) throw error;
  return data;
}

// === FUNCIONES ESPECÍFICAS DEL ADMIN ===

// Verificar si el usuario es administrador
async function isAdmin(userEmail) {
  // Lista de emails de administradores - puedes modificar esto
  const adminEmails = [
    'mauricio.diaz@admin.com',
    'admin@evalua-t.com',
    'tu-email@admin.com', // Cambia esto por tu email real
    // Agregar más emails de admin aquí
  ];
  
  return adminEmails.includes(userEmail);
}

// Obtener todos los recursos para el admin
async function getAllResourcesForAdmin() {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .select(`
        *,
        professors(id, name),
        profiles(full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo recursos para admin:', error);
    throw error;
  }
}

// Actualizar estado de un recurso (solo admin)
async function updateResourceStatus(resourceId, newStatus) {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: newStatus,
        fecha_revision: new Date().toISOString()
      })
      .eq('id', resourceId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error actualizando estado del recurso:', error);
    throw error;
  }
}

// Eliminar recurso permanentemente (solo admin)
async function deleteResourcePermanently(resourceId) {
  try {
    // Primero obtenemos la información del archivo para eliminarlo del storage
    const { data: recurso, error: fetchError } = await supabaseClient
      .from('recursos')
      .select('path_storage')
      .eq('id', resourceId)
      .single();

    if (fetchError) throw fetchError;

    // Eliminar archivo del storage si existe
    if (recurso.path_storage) {
      const fileName = recurso.path_storage.replace('recursos-pro/', '');
      await supabaseClient.storage
        .from('recursos-pro')
        .remove([fileName]);
    }

    // Eliminar registro de la base de datos
    const { error } = await supabaseClient
      .from('recursos')
      .delete()
      .eq('id', resourceId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error eliminando recurso:', error);
    throw error;
  }
}

// Obtener estadísticas generales para el dashboard admin
async function getAdminStats() {
  try {
    // Obtener conteos de recursos por estado
    const { data: recursos, error: recursosError } = await supabaseClient
      .from('recursos')
      .select('status, id_usuario_que_subio');

    if (recursosError) throw recursosError;

    // Obtener conteo de usuarios únicos
    const usuariosUnicos = new Set(recursos.map(r => r.id_usuario_que_subio)).size;

    const stats = {
      total: recursos.length,
      pendientes: recursos.filter(r => r.status === 'pendiente').length,
      aprobados: recursos.filter(r => r.status === 'aprobado').length,
      rechazados: recursos.filter(r => r.status === 'rechazado').length,
      usuariosActivos: usuariosUnicos
    };

    return stats;
  } catch (error) {
    console.error('Error obteniendo estadísticas del admin:', error);
    throw error;
  }
}

// Obtener recursos pendientes de aprobación
async function getPendingResources() {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .select(`
        *,
        professors(id, name),
        profiles(full_name)
      `)
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true }); // Los más antiguos primero

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo recursos pendientes:', error);
    throw error;
  }
}

// Aprobar recurso en lote
async function approveResourcesBatch(resourceIds) {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: 'aprobado',
        fecha_revision: new Date().toISOString()
      })
      .in('id', resourceIds)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error aprobando recursos en lote:', error);
    throw error;
  }
}

// Rechazar recurso en lote
async function rejectResourcesBatch(resourceIds) {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: 'rechazado',
        fecha_revision: new Date().toISOString()
      })
      .in('id', resourceIds)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error rechazando recursos en lote:', error);
    throw error;
  }
}

// Buscar recursos por criterios específicos
async function searchResourcesForAdmin(filters) {
  try {
    let query = supabaseClient
      .from('recursos')
      .select(`
        *,
        professors(id, name),
        profiles(full_name)
      `);

    // Aplicar filtros
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.professorId) {
      query = query.eq('id_catedratico', filters.professorId);
    }

    if (filters.tipoRecurso) {
      query = query.eq('tipo_recurso', filters.tipoRecurso);
    }

    if (filters.periodoAcademico) {
      query = query.eq('periodo_academico', filters.periodoAcademico);
    }

    if (filters.searchTerm) {
      query = query.ilike('nombre_archivo', `%${filters.searchTerm}%`);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error buscando recursos para admin:', error);
    throw error;
  }
}

// Exportar todas las funciones
export {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  isAuthenticated,
  getProfessors,
  getProfessorById,
  getTopRatedProfessors,
  searchProfessors,
  submitEvaluation,
  hasUserEvaluatedProfessor,
  getUserEvaluations,
  getUserComments,
  getAllCommentsWithProfessors,
  likeComment,
  unlikeComment,
  hasUserLikedComment,
  getUserLikesForComments,
  addProfessor,
  syncAllProfessorRatings,
  getRandomUnevaluatedProfessor,
  getProfessorResources,
  hasProSubscription,
  uploadResource,
  rateResource,
  getUserStats,
  getTopContributors,
  // Funciones de admin
  isAdmin,
  getAllResourcesForAdmin,
  updateResourceStatus,
  deleteResourcePermanently,
  getAdminStats,
  getPendingResources,
  approveResourcesBatch,
  rejectResourcesBatch,
  searchResourcesForAdmin
};
